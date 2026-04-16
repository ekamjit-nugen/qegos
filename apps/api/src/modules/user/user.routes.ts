import { Router, type Request, type Response } from 'express';
import type { Model } from 'mongoose';
import { AppError, asyncHandler } from '@nugen/error-handler';
import { validate, objectId, pagination, search, email, requiredString } from '@nugen/validator';
import type { check as CheckFn } from '@nugen/rbac';
import type { authenticate as AuthFn, AuthenticatedRequest } from '@nugen/auth';
import * as _auditLog from '@nugen/audit-log';
import { getRequestId } from '../../lib/requestContext';
import { createUserService } from './user.service';
import type { IUserDocument } from './user.types';

const auditLog = {
  log: (params: Record<string, unknown>): void => {
    _auditLog.log({ ...params, requestId: getRequestId() } as never).catch(() => {
      // fire-and-forget: audit log failure is non-critical
    });
  },
};

export interface UserRouteDeps {
  UserModel: Model<IUserDocument>;
  authenticate: typeof AuthFn;
  checkPermission: typeof CheckFn;
}

// User type hierarchy for escalation checks
const USER_TYPE_HIERARCHY: Record<number, number> = {
  0: 0, // super_admin — highest
  1: 1, // admin
  5: 2, // office_manager
  6: 3, // senior_staff
  3: 4, // staff
  2: 5, // client
  4: 5, // student (same level as client)
};

export function createUserRoutes(deps: UserRouteDeps): Router {
  const router = Router();
  const { UserModel, authenticate: auth, checkPermission: check } = deps;
  const service = createUserService(UserModel);

  // --- GET /users/me ---
  router.get(
    '/me',
    auth() as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { userId } = (req as AuthenticatedRequest).user;
      const user = await service.getUserById(userId);
      res.status(200).json({ status: 200, data: user });
    }),
  );

  // --- PUT /users/me ---
  router.put(
    '/me',
    auth() as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { userId } = (req as AuthenticatedRequest).user;
      // Only allow safe self-editable fields
      const allowedFields = [
        'firstName',
        'lastName',
        'email',
        'mobile',
        'address',
        'dateOfBirth',
        'gender',
        'maritalStatus',
        'preferredLanguage',
        'preferredContact',
        'timezone',
      ];
      const updates: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if ((req.body as Record<string, unknown>)[field] !== undefined) {
          updates[field] = (req.body as Record<string, unknown>)[field];
        }
      }
      const user = await service.updateUser(userId, updates as Partial<IUserDocument>);
      res.status(200).json({ status: 200, data: user });

      auditLog.log({
        actor: (req as unknown as { user?: { userId?: string } }).user?.userId ?? '',
        actorType: 'user',
        action: 'update',
        resource: 'user',
        resourceId: userId,
        severity: 'info',
        description: `User ${userId} updated own profile`,
      });
    }),
  );

  // --- GET /users ---
  router.get(
    '/',
    auth() as never,
    check('users', 'read') as never,
    ...validate([...pagination(), search()]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const result = await service.listUsers({
        ...(req.query as Record<string, string>),
        scopeFilter: authReq.scopeFilter,
      });
      res.status(200).json({
        status: 200,
        data: result.users,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    }),
  );

  // --- GET /users/:id ---
  router.get(
    '/:id',
    auth() as never,
    check('users', 'read') as never,
    ...validate([objectId('id')]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const user = await service.getUserById(req.params.id, authReq.scopeFilter);
      res.status(200).json({ status: 200, data: user });
    }),
  );

  // --- POST /users (FIX for Vegeta G-6: admin user creation) ---
  router.post(
    '/',
    auth() as never,
    check('users', 'create') as never,
    ...validate([requiredString('firstName'), requiredString('lastName'), email()]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const body = req.body as Record<string, unknown>;

      // FIX for Vegeta B-27: Prevent role escalation
      const targetUserType = body.userType as number | undefined;
      if (targetUserType !== undefined) {
        const actorLevel = USER_TYPE_HIERARCHY[authReq.user.userType] ?? 99;
        const targetLevel = USER_TYPE_HIERARCHY[targetUserType] ?? 99;
        if (targetLevel <= actorLevel && authReq.user.userType !== 0) {
          throw AppError.forbidden('Cannot create a user with equal or higher privilege');
        }
      }

      const user = await service.createUser(body as Partial<IUserDocument>);
      res.status(201).json({ status: 201, data: user });

      auditLog.log({
        actor: (req as unknown as { user?: { userId?: string } }).user?.userId ?? '',
        actorType: 'admin',
        action: 'create',
        resource: 'user',
        resourceId: String(user._id),
        severity: 'info',
        description: `Created user ${String(user._id)}`,
      });
    }),
  );

  // --- PUT /users/:id (admin edit) ---
  router.put(
    '/:id',
    auth() as never,
    check('users', 'update') as never,
    ...validate([objectId('id')]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const body = req.body as Record<string, unknown>;

      // FIX for Vegeta B-27: Prevent userType escalation
      if (body.userType !== undefined) {
        const newType = body.userType as number;
        const actorLevel = USER_TYPE_HIERARCHY[authReq.user.userType] ?? 99;
        const targetLevel = USER_TYPE_HIERARCHY[newType] ?? 99;

        // Only super_admin (userType 0) can set userType to 0 or 1
        if (newType <= 1 && authReq.user.userType !== 0) {
          throw AppError.forbidden('Only super_admin can assign super_admin or admin userType');
        }

        // Cannot escalate to equal or higher privilege level
        if (targetLevel <= actorLevel && authReq.user.userType !== 0) {
          throw AppError.forbidden('Cannot escalate user to equal or higher privilege');
        }
      }

      const user = await service.updateUser(
        req.params.id,
        body as Partial<IUserDocument>,
        authReq.scopeFilter,
      );
      res.status(200).json({ status: 200, data: user });

      auditLog.log({
        actor: (req as unknown as { user?: { userId?: string } }).user?.userId ?? '',
        actorType: 'admin',
        action: 'update',
        resource: 'user',
        resourceId: req.params.id,
        severity: 'warning',
        description: `Admin updated user ${req.params.id}`,
      });
    }),
  );

  // --- PATCH /users/:id/status ---
  // FIX for Vegeta B-23: Apply scopeFilter
  router.patch(
    '/:id/status',
    auth() as never,
    check('users', 'update') as never,
    ...validate([objectId('id')]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const user = await service.toggleStatus(req.params.id, authReq.scopeFilter);
      res.status(200).json({ status: 200, data: user });

      auditLog.log({
        actor: (req as unknown as { user?: { userId?: string } }).user?.userId ?? '',
        actorType: 'admin',
        action: 'status_change',
        resource: 'user',
        resourceId: req.params.id,
        severity: 'warning',
        description: `Toggled status for user ${req.params.id}`,
      });
    }),
  );

  // --- DELETE /users/:id ---
  // FIX for Vegeta B-24: Apply scopeFilter
  router.delete(
    '/:id',
    auth() as never,
    check('users', 'delete') as never,
    ...validate([objectId('id')]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const user = await service.softDelete(req.params.id, authReq.scopeFilter);
      res.status(200).json({ status: 200, data: { message: 'User deleted', id: user._id } });

      auditLog.log({
        actor: (req as unknown as { user?: { userId?: string } }).user?.userId ?? '',
        actorType: 'admin',
        action: 'delete',
        resource: 'user',
        resourceId: req.params.id,
        severity: 'critical',
        description: `Soft-deleted user ${req.params.id}`,
      });
    }),
  );

  // --- PUT /users/me/consent ---
  router.put(
    '/me/consent',
    auth() as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { userId } = (req as AuthenticatedRequest).user;
      const consentRecord = req.body as Record<string, unknown>;

      // Add timestamp and source to each consent entry
      const processedConsent: Record<string, unknown> = {};
      for (const [channel, consent] of Object.entries(consentRecord)) {
        if (typeof consent === 'object' && consent !== null) {
          processedConsent[`consentRecord.${channel}`] = {
            ...(consent as Record<string, unknown>),
            date: new Date(),
            source: 'api',
          };
        }
      }

      const user = await UserModel.findByIdAndUpdate(
        userId,
        { $set: processedConsent },
        { new: true },
      );
      res.status(200).json({ status: 200, data: user?.consentRecord });
    }),
  );

  return router;
}
