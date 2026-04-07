import { Router, type Request, type Response, type RequestHandler } from 'express';
import { body, param, query as queryValidator } from 'express-validator';
import type { Model } from 'mongoose';
import { AppError, asyncHandler } from '@nugen/error-handler';
import { validate } from '@nugen/validator';
import * as auditLog from '@nugen/audit-log';
import type { IBillingDisputeDocument, DisputeStatus } from './billingDispute.types';
import { VALID_DISPUTE_TRANSITIONS } from './billingDispute.types';

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
  checkPermission: (resource: string, action: string) => RequestHandler;
}

function createDisputeValidation(): import('express-validator').ValidationChain[] {
  return [
    body('orderId')
      .trim().notEmpty().withMessage('Order ID is required')
      .isMongoId().withMessage('Order ID must be a valid ID'),
    body('paymentId')
      .trim().notEmpty().withMessage('Payment ID is required')
      .isMongoId().withMessage('Payment ID must be a valid ID'),
    body('disputeType')
      .trim().notEmpty().withMessage('Dispute type is required')
      .isIn(['overcharge', 'service_not_delivered', 'quality_issue', 'incorrect_amount', 'duplicate_charge', 'unauthorised'])
      .withMessage('Invalid dispute type'),
    body('disputedAmount')
      .notEmpty().withMessage('Disputed amount is required')
      .isInt({ min: 1 }).withMessage('Disputed amount must be a positive integer (cents)')
      .toInt(),
    body('clientStatement')
      .trim().notEmpty().withMessage('Client statement is required')
      .isLength({ max: 2000 }).withMessage('Client statement must be at most 2000 characters'),
    body('ticketId')
      .optional().trim().isMongoId().withMessage('Ticket ID must be a valid ID'),
  ];
}

function updateDisputeValidation(): import('express-validator').ValidationChain[] {
  return [
    param('id').trim().notEmpty().isMongoId().withMessage('Dispute ID must be a valid ID'),
    body('status')
      .optional()
      .isIn(['investigating', 'pending_approval', 'approved', 'rejected', 'completed'])
      .withMessage('Invalid status'),
    body('staffAssessment')
      .optional().trim().isLength({ max: 2000 })
      .withMessage('Staff assessment must be at most 2000 characters'),
    body('resolution')
      .optional()
      .isIn(['full_refund', 'partial_refund', 'credit_issued', 'no_action', 'service_redo', 'discount_applied'])
      .withMessage('Invalid resolution'),
    body('resolvedAmount')
      .optional().isInt({ min: 0 }).withMessage('Resolved amount must be a non-negative integer (cents)')
      .toInt(),
  ];
}

/**
 * Create billing dispute routes with injected dependencies.
 */
export function createBillingDisputeRoutes(deps: BillingDisputeRouteDeps): Router {
  const router = Router();
  const { BillingDisputeModel, authenticate, checkPermission } = deps;

  // ─── POST / — Create billing dispute ───────────────────────────────────────
  router.post(
    '/',
    authenticate() as RequestHandler,
    checkPermission('billing_disputes', 'create') as RequestHandler,
    ...validate(createDisputeValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { orderId, paymentId, disputeType, disputedAmount, clientStatement, ticketId } =
        req.body as {
          orderId: string;
          paymentId: string;
          disputeType: string;
          disputedAmount: number;
          clientStatement: string;
          ticketId?: string;
        };

      const dispute = await BillingDisputeModel.create({
        orderId,
        paymentId,
        disputeType,
        disputedAmount,
        clientStatement,
        ticketId,
        status: 'raised',
      });

      // BIL-INV-07: Critical audit log for all billing disputes
      await auditLog.logFromRequest(req, {
        action: 'create',
        resource: 'billing_dispute',
        resourceId: dispute._id.toString(),
        description: `Billing dispute raised: ${disputeType}, ${disputedAmount} cents, orderId: ${orderId}`,
        severity: 'critical',
      });

      res.status(201).json({
        status: 201,
        data: dispute,
      });
    }),
  );

  // ─── GET / — List billing disputes ─────────────────────────────────────────
  router.get(
    '/',
    authenticate() as RequestHandler,
    checkPermission('billing_disputes', 'read') as RequestHandler,
    ...validate([
      queryValidator('page').optional().isInt({ min: 1 }).toInt(),
      queryValidator('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
      queryValidator('status')
        .optional()
        .isIn(['raised', 'investigating', 'pending_approval', 'approved', 'rejected', 'completed']),
      queryValidator('disputeType')
        .optional()
        .isIn(['overcharge', 'service_not_delivered', 'quality_issue', 'incorrect_amount', 'duplicate_charge', 'unauthorised']),
    ]),
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

      const filter: Record<string, unknown> = {};
      if (status) filter.status = status;
      if (disputeType) filter.disputeType = disputeType;

      // Apply scope filter
      if (authReq.scopeFilter && Object.keys(authReq.scopeFilter).length > 0) {
        Object.assign(filter, authReq.scopeFilter);
      }

      const pageNum = Number(page);
      const limitNum = Number(limit);
      const skip = (pageNum - 1) * limitNum;

      const [disputes, total] = await Promise.all([
        BillingDisputeModel.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        BillingDisputeModel.countDocuments(filter),
      ]);

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
    ...validate([
      param('id').trim().notEmpty().isMongoId().withMessage('Dispute ID must be a valid ID'),
    ]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { id } = req.params;

      const query: Record<string, unknown> = { _id: id };
      if (authReq.scopeFilter && Object.keys(authReq.scopeFilter).length > 0) {
        Object.assign(query, authReq.scopeFilter);
      }

      const dispute = await BillingDisputeModel.findOne(query).lean();
      if (!dispute) {
        throw AppError.notFound('Billing dispute');
      }

      res.status(200).json({
        status: 200,
        data: dispute,
      });
    }),
  );

  // ─── PATCH /:id — Update billing dispute ───────────────────────────────────
  router.patch(
    '/:id',
    authenticate() as RequestHandler,
    checkPermission('billing_disputes', 'update') as RequestHandler,
    ...validate(updateDisputeValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { id } = req.params;
      const updates = req.body as {
        status?: DisputeStatus;
        staffAssessment?: string;
        resolution?: string;
        resolvedAmount?: number;
      };

      const dispute = await BillingDisputeModel.findById(id);
      if (!dispute) {
        throw AppError.notFound('Billing dispute');
      }

      const changes: Record<string, { from: unknown; to: unknown }> = {};

      // Validate status transition
      if (updates.status) {
        const allowed = VALID_DISPUTE_TRANSITIONS[dispute.status];
        if (!allowed.includes(updates.status)) {
          throw AppError.badRequest(
            `Invalid dispute status transition: ${dispute.status} -> ${updates.status}`,
          );
        }
        changes.status = { from: dispute.status, to: updates.status };
        dispute.status = updates.status;
      }

      if (updates.staffAssessment !== undefined) {
        changes.staffAssessment = { from: dispute.staffAssessment, to: updates.staffAssessment };
        dispute.staffAssessment = updates.staffAssessment;
      }

      if (updates.resolution !== undefined) {
        changes.resolution = { from: dispute.resolution, to: updates.resolution };
        dispute.resolution = updates.resolution as IBillingDisputeDocument['resolution'];
      }

      if (updates.resolvedAmount !== undefined) {
        changes.resolvedAmount = { from: dispute.resolvedAmount, to: updates.resolvedAmount };
        dispute.resolvedAmount = updates.resolvedAmount;
      }

      // Set approvedBy if being approved
      if (updates.status === 'approved') {
        dispute.approvedBy = authReq.user.userId as unknown as import('mongoose').Types.ObjectId;
      }

      await dispute.save();

      // BIL-INV-07: Critical audit log
      await auditLog.logFromRequest(req, {
        action: 'status_change',
        resource: 'billing_dispute',
        resourceId: dispute._id.toString(),
        changes,
        description: `Billing dispute updated: ${Object.keys(changes).join(', ')}`,
        severity: 'critical',
      });

      res.status(200).json({
        status: 200,
        data: dispute,
      });
    }),
  );

  // ─── DELETE /:id — Soft delete billing dispute ─────────────────────────────
  router.delete(
    '/:id',
    authenticate() as RequestHandler,
    checkPermission('billing_disputes', 'delete') as RequestHandler,
    ...validate([
      param('id').trim().notEmpty().isMongoId().withMessage('Dispute ID must be a valid ID'),
    ]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;

      const dispute = await BillingDisputeModel.findById(id);
      if (!dispute) {
        throw AppError.notFound('Billing dispute');
      }

      dispute.isDeleted = true;
      dispute.deletedAt = new Date();
      await dispute.save();

      // BIL-INV-07: Critical audit log
      await auditLog.logFromRequest(req, {
        action: 'delete',
        resource: 'billing_dispute',
        resourceId: dispute._id.toString(),
        description: `Billing dispute soft-deleted`,
        severity: 'critical',
      });

      res.status(200).json({
        status: 200,
        data: { message: 'Billing dispute deleted' },
      });
    }),
  );

  return router;
}
