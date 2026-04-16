import { Router, type Request, type Response, type RequestHandler } from 'express';
import type { Model } from 'mongoose';
import { asyncHandler } from '@nugen/error-handler';
import { validate } from '@nugen/validator';
import * as auditLog from '@nugen/audit-log';
import type { CheckPermissionFn } from '@nugen/rbac';
import type { IBillingDisputeDocument, DisputeStatus } from './billingDispute.types';
import {
  initBillingService,
  createDispute,
  listDisputes,
  getDispute,
  updateDispute,
  softDeleteDispute,
} from './billingDispute.service';
import {
  validateCreateDispute,
  validateUpdateDispute,
  validateDisputeId,
  validateListDisputes,
} from './billingDispute.validators';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    userType: number;
    roleId: string;
  };
  scopeFilter?: Record<string, unknown>;
}

export interface BillingDisputeRouteDeps {
  BillingDisputeModel: Model<IBillingDisputeDocument>;
  authenticate: () => RequestHandler;
  checkPermission: CheckPermissionFn;
}

export function createBillingDisputeRoutes(deps: BillingDisputeRouteDeps): Router {
  const router = Router();
  const { BillingDisputeModel, authenticate, checkPermission } = deps;

  initBillingService(BillingDisputeModel);

  // ─── POST / — Create billing dispute ───────────────────────────────────────
  router.post(
    '/',
    authenticate() as RequestHandler,
    checkPermission('billing_disputes', 'create') as RequestHandler,
    ...validate(validateCreateDispute()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const body = req.body as {
        orderId: string;
        paymentId: string;
        disputeType: string;
        disputedAmount: number;
        clientStatement: string;
        ticketId?: string;
      };

      const dispute = await createDispute(body);

      await auditLog.logFromRequest(req, {
        action: 'create',
        resource: 'billing_dispute',
        resourceId: dispute._id.toString(),
        description: `Billing dispute raised: ${body.disputeType}, ${body.disputedAmount} cents, orderId: ${body.orderId}`,
        severity: 'critical',
      });

      res.status(201).json({ status: 201, data: dispute });
    }),
  );

  // ─── GET / — List billing disputes ─────────────────────────────────────────
  router.get(
    '/',
    authenticate() as RequestHandler,
    checkPermission('billing_disputes', 'read') as RequestHandler,
    ...validate(validateListDisputes()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const {
        page = 1,
        limit = 20,
        status,
        disputeType,
      } = req.query as {
        page?: number;
        limit?: number;
        status?: string;
        disputeType?: string;
      };

      const { disputes, total } = await listDisputes({
        status,
        disputeType,
        scopeFilter: authReq.scopeFilter,
        page: Number(page),
        limit: Number(limit),
      });

      const pageNum = Number(page);
      const limitNum = Number(limit);

      res.status(200).json({
        status: 200,
        data: disputes,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasNext: pageNum * limitNum < total,
          hasPrev: pageNum > 1,
        },
      });
    }),
  );

  // ─── GET /:id — Get billing dispute detail ─────────────────────────────────
  router.get(
    '/:id',
    authenticate() as RequestHandler,
    checkPermission('billing_disputes', 'read') as RequestHandler,
    ...validate(validateDisputeId()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const dispute = await getDispute(req.params.id, authReq.scopeFilter);
      res.status(200).json({ status: 200, data: dispute });
    }),
  );

  // ─── PATCH /:id — Update billing dispute ───────────────────────────────────
  router.patch(
    '/:id',
    authenticate() as RequestHandler,
    checkPermission('billing_disputes', 'update') as RequestHandler,
    ...validate(validateUpdateDispute()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const updates = req.body as {
        status?: DisputeStatus;
        staffAssessment?: string;
        resolution?: string;
        resolvedAmount?: number;
      };

      const { dispute, changes } = await updateDispute(
        req.params.id,
        updates,
        authReq.user.userId,
        authReq.scopeFilter,
      );

      await auditLog.logFromRequest(req, {
        action: 'status_change',
        resource: 'billing_dispute',
        resourceId: dispute._id.toString(),
        changes,
        description: `Billing dispute updated: ${Object.keys(changes).join(', ')}`,
        severity: 'critical',
      });

      res.status(200).json({ status: 200, data: dispute });
    }),
  );

  // ─── DELETE /:id — Soft delete billing dispute ─────────────────────────────
  router.delete(
    '/:id',
    authenticate() as RequestHandler,
    checkPermission('billing_disputes', 'delete') as RequestHandler,
    ...validate(validateDisputeId()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const dispute = await softDeleteDispute(req.params.id, authReq.scopeFilter);

      await auditLog.logFromRequest(req, {
        action: 'delete',
        resource: 'billing_dispute',
        resourceId: dispute._id.toString(),
        description: 'Billing dispute soft-deleted',
        severity: 'critical',
      });

      res.status(200).json({ status: 200, data: { message: 'Billing dispute deleted' } });
    }),
  );

  return router;
}
