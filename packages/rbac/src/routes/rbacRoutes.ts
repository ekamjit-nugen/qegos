import { Router, type Request, type Response } from 'express';
import type { Model } from 'mongoose';
import { AppError, asyncHandler } from '@nugen/error-handler';
import { validate, requiredString, objectId, pagination } from '@nugen/validator';
import { check, invalidateRoleCache } from '../middleware/checkPermission';
import { computeDiff } from '../models/permissionSnapshotModel';
import { getBaselinePermissions } from '../seed/defaultRoles';
import { detectAnomalies } from '../services/anomalyDetector';
import type {
  IRoleDocument,
  IPermissionSnapshotDocument,
  IPermission,
  AuthenticatedRbacRequest,
} from '../types';

export interface RbacRouteDeps {
  RoleModel: Model<IRoleDocument>;
  PermissionSnapshotModel: Model<IPermissionSnapshotDocument>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mongoose Model<T> invariance; rbac only needs structural field access
  UserModel: Model<any>;
  authenticate: () => unknown;
}

const SENSITIVE_RESOURCES = ['payments', 'system_config', 'audit_logs', 'payment_config'];

/**
 * Validate that proposed permissions do not reduce below baseline for system roles.
 * FIX for Vegeta B-13: Actual implementation of RBAC-INV-05.
 */
function validateBaselinePermissions(roleName: string, proposed: IPermission[]): string | null {
  const baseline = getBaselinePermissions(roleName);
  if (!baseline) {
    return null; // Not a system role
  }

  for (const basePerm of baseline) {
    const proposedPerm = proposed.find((p) => p.resource === basePerm.resource);
    if (!proposedPerm) {
      return `Cannot remove resource "${basePerm.resource}" from system role "${roleName}"`;
    }
    for (const action of basePerm.actions) {
      if (!proposedPerm.actions.includes(action)) {
        return `Cannot remove action "${action}" on "${basePerm.resource}" from system role "${roleName}"`;
      }
    }
    // Scope cannot be more restrictive than baseline
    const scopeHierarchy = ['all', 'assigned', 'own', 'none'];
    const baseIdx = scopeHierarchy.indexOf(basePerm.scope);
    const propIdx = scopeHierarchy.indexOf(proposedPerm.scope);
    if (propIdx > baseIdx) {
      return `Cannot restrict scope on "${basePerm.resource}" below "${basePerm.scope}" for system role "${roleName}"`;
    }
  }

  return null;
}

export function createRbacRoutes(deps: RbacRouteDeps): Router {
  const router = Router();
  const { RoleModel, PermissionSnapshotModel, UserModel, authenticate: auth } = deps;

  // --- GET /roles ---
  router.get(
    '/roles',
    auth() as never,
    check('system_config', 'read') as never,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const roles = await RoleModel.find({}).sort({ name: 1 }).lean();
      res.status(200).json({ status: 200, data: roles });
    }),
  );

  // --- POST /roles ---
  router.post(
    '/roles',
    auth() as never,
    check('system_config', 'create') as never,
    ...validate([requiredString('name'), requiredString('displayName')]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRbacRequest;
      const { name, displayName, permissions } = req.body as {
        name: string;
        displayName: string;
        permissions: IPermission[];
      };

      // Only super_admin can create roles
      if (authReq.user.userType > 0) {
        throw AppError.forbidden('Only super_admin can create roles');
      }

      const role = await RoleModel.create({
        name,
        displayName,
        permissions,
        isSystem: false,
        createdBy: authReq.user.userId,
      });

      res.status(201).json({ status: 201, data: role });
    }),
  );

  // --- PUT /roles/:id ---
  router.put(
    '/roles/:id',
    auth() as never,
    check('system_config', 'update') as never,
    ...validate([objectId('id'), requiredString('reason')]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRbacRequest;
      const { permissions, reason } = req.body as {
        permissions: IPermission[];
        reason: string;
      };

      const role = await RoleModel.findById(req.params.id);
      if (!role) {
        throw AppError.notFound('Role');
      }

      // Check for sensitive resource escalation (PRM-INV-03)
      if (authReq.user.userType > 0) {
        const addsSensitive = permissions.some(
          (p) =>
            SENSITIVE_RESOURCES.includes(p.resource) &&
            !role.permissions.find(
              (existing) =>
                existing.resource === p.resource &&
                p.actions.every((a) => existing.actions.includes(a)),
            ),
        );
        if (addsSensitive) {
          throw AppError.forbidden(
            'Adding payment/config/audit_logs access requires super_admin approval',
          );
        }
      }

      // RBAC-INV-05: System roles cannot be reduced below baseline
      if (role.isSystem) {
        const violation = validateBaselinePermissions(role.name, permissions);
        if (violation) {
          throw AppError.badRequest(violation);
        }
      }

      // Create permission snapshot (PRM-INV-01)
      const diff = computeDiff(role.permissions, permissions);
      await PermissionSnapshotModel.create({
        roleId: role._id,
        roleName: role.name,
        permissionsBefore: role.permissions,
        permissionsAfter: permissions,
        diff,
        changedBy: authReq.user.userId,
        reason,
      });

      role.permissions = permissions;
      await role.save();

      // Invalidate cache
      await invalidateRoleCache(role._id.toString());

      res.status(200).json({ status: 200, data: role });
    }),
  );

  // --- DELETE /roles/:id ---
  router.delete(
    '/roles/:id',
    auth() as never,
    check('system_config', 'delete') as never,
    ...validate([objectId('id')]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const role = await RoleModel.findById(req.params.id);
      if (!role) {
        throw AppError.notFound('Role');
      }

      if (role.isSystem) {
        throw AppError.badRequest('System roles cannot be deleted');
      }

      // Check if any users are assigned this role
      const usersWithRole = await (UserModel as Model<{ roleId: string }>).countDocuments({
        roleId: role._id,
        isDeleted: { $ne: true },
      });
      if (usersWithRole > 0) {
        throw AppError.conflict(
          `Cannot delete role: ${usersWithRole} user(s) are still assigned to it`,
        );
      }

      await role.deleteOne();
      await invalidateRoleCache(role._id.toString());

      res.status(200).json({ status: 200, data: { message: 'Role deleted' } });
    }),
  );

  // --- PUT /roles/assign/:userId ---
  router.put(
    '/roles/assign/:userId',
    auth() as never,
    check('staff_mgmt', 'update') as never,
    ...validate([objectId('userId'), objectId('roleId', 'body')]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRbacRequest;
      const { roleId } = req.body as { roleId: string };

      // FIX for Vegeta B-14: Check user exists and is not soft-deleted
      const user = await (
        UserModel as Model<{ roleId: string; isDeleted?: boolean; userType: number }>
      ).findOne({
        _id: req.params.userId,
        isDeleted: { $ne: true },
      });

      if (!user) {
        throw AppError.notFound('User');
      }

      const role = await RoleModel.findById(roleId);
      if (!role) {
        throw AppError.notFound('Role');
      }

      // FIX for Vegeta B-27: Prevent escalation to equal/higher role
      if (authReq.user.userType > 0 && user.userType <= authReq.user.userType) {
        throw AppError.forbidden('Cannot assign role to a user of equal or higher privilege');
      }

      user.roleId = roleId;
      await (user as unknown as { save: () => Promise<void> }).save();
      await invalidateRoleCache(roleId);

      res.status(200).json({ status: 200, data: { message: 'Role assigned' } });
    }),
  );

  // --- GET /permissions/anomalies ---
  router.get(
    '/permissions/anomalies',
    auth() as never,
    check('system_config', 'read') as never,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const anomalies = await detectAnomalies(RoleModel, UserModel);
      res.status(200).json({ status: 200, data: anomalies });
    }),
  );

  // --- GET /permissions/history ---
  router.get(
    '/permissions/history',
    auth() as never,
    check('system_config', 'read') as never,
    ...validate(pagination()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const filter: Record<string, unknown> = {};
      if (req.query.roleId) {
        filter.roleId = req.query.roleId;
      }

      const [snapshots, total] = await Promise.all([
        PermissionSnapshotModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        PermissionSnapshotModel.countDocuments(filter),
      ]);

      res.status(200).json({
        status: 200,
        data: snapshots,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }),
  );

  // --- POST /permissions/simulate (PRM-INV-05: READ-ONLY) ---
  router.post(
    '/permissions/simulate',
    auth() as never,
    check('system_config', 'read') as never,
    ...validate([objectId('roleId', 'body')]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { roleId, proposedPermissions } = req.body as {
        roleId: string;
        proposedPermissions: IPermission[];
      };

      const role = await RoleModel.findById(roleId).lean();
      if (!role) {
        throw AppError.notFound('Role');
      }

      const diff = computeDiff(role.permissions, proposedPermissions);

      // Count affected users
      const affectedCount = await (UserModel as Model<{ roleId: string }>).countDocuments({
        roleId: role._id,
        isDeleted: { $ne: true },
      });

      // Check baseline violations for system roles
      let baselineViolation: string | null = null;
      if (role.isSystem) {
        baselineViolation = validateBaselinePermissions(role.name, proposedPermissions);
      }

      res.status(200).json({
        status: 200,
        data: {
          diff,
          affectedUsers: affectedCount,
          baselineViolation,
        },
      });
    }),
  );

  return router;
}
