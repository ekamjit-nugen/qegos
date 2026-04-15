import { Router, type Request, type Response, type RequestHandler } from 'express';
import { param } from 'express-validator';
import type { Model } from 'mongoose';
import { asyncHandler } from '@nugen/error-handler';
import { validate } from '@nugen/validator';
import * as _auditLog from '@nugen/audit-log';
import type { CheckPermissionFn } from '@nugen/rbac';
import { getRequestId } from '../../lib/requestContext';

// Fix for B-3.45: Wrap audit log to catch failures instead of silent void
const auditLog = {
  log: (params: Record<string, unknown>): void => {
    _auditLog.log({ ...params, requestId: getRequestId() } as never).catch(() => {
      // fire-and-forget: audit log failure is non-critical
    });
  },
};
import type { IReviewAssignmentDocument, IChangeRequest } from './review.types';
import { createReviewService } from './review.service';
import {
  submitForReviewValidation,
  startReviewValidation,
  approveReviewValidation,
  requestChangesValidation,
  rejectReviewValidation,
  resolveChangeValidation,
  updateChecklistValidation,
} from './review.validators';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    userType: number;
    roleId: string;
  };
  scopeFilter?: Record<string, unknown>;
}

export interface ReviewRouteDeps {
  ReviewAssignmentModel: Model<IReviewAssignmentDocument>;
  OrderModel: Model<any>;
  UserModel: Model<any>;
  authenticate: () => RequestHandler;
  checkPermission: CheckPermissionFn;
}

export function createReviewRoutes(deps: ReviewRouteDeps): Router {
  const router = Router();
  const {
    ReviewAssignmentModel, OrderModel, UserModel,
    authenticate: auth, checkPermission: check,
  } = deps;

  const service = createReviewService({ ReviewAssignmentModel, OrderModel, UserModel });

  // 1. POST /order-reviews/submit — Submit for review
  router.post(
    '/submit',
    auth() as never,
    check('reviews', 'create') as never,
    ...validate(submitForReviewValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { orderId } = req.body as { orderId: string };
      const review = await service.submitForReview(orderId, authReq.user.userId);

      auditLog.log({
        actor: authReq.user.userId,
        actorType: 'staff',
        action: 'create',
        resource: 'review',
        resourceId: review._id.toString(),
        description: `Submitted order ${orderId} for review`,
        severity: 'info',
      });

      res.status(201).json({ status: 201, data: review });
    }),
  );

  // GET /order-reviews — List reviews (paginated, filterable)
  router.get(
    '/',
    auth() as never,
    check('reviews', 'read') as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const skip = (page - 1) * limit;

      const filter: Record<string, unknown> = {};
      if (req.query.status) { filter.status = req.query.status; }
      if (req.query.reviewerId) { filter.reviewerId = req.query.reviewerId; }
      if (req.query.preparerId) { filter.preparerId = req.query.preparerId; }

      const [data, total] = await Promise.all([
        ReviewAssignmentModel.find(filter)
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        ReviewAssignmentModel.countDocuments(filter),
      ]);

      res.status(200).json({
        status: 200,
        data,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }),
  );

  // 2. GET /order-reviews/pending — My pending reviews
  router.get(
    '/pending',
    auth() as never,
    check('reviews', 'read') as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const reviews = await service.getPendingReviews(authReq.user.userId);
      res.status(200).json({ status: 200, data: reviews });
    }),
  );

  // 9. GET /order-reviews/stats — Review metrics
  router.get(
    '/stats',
    auth() as never,
    check('reviews', 'read') as never,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const stats = await service.getStats();
      res.status(200).json({ status: 200, data: stats });
    }),
  );

  // 3. GET /order-reviews/:orderId — Review detail
  // Fix for B-3.43: Validate :orderId is a valid MongoId
  router.get(
    '/:orderId',
    auth() as never,
    check('reviews', 'read') as never,
    ...validate([param('orderId').isMongoId().withMessage('Invalid order ID')]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const review = await service.getReviewDetail(req.params.orderId);
      res.status(200).json({ status: 200, data: review });
    }),
  );

  // 4. PATCH /order-reviews/:orderId/start — Start reviewing
  router.patch(
    '/:orderId/start',
    auth() as never,
    check('reviews', 'update') as never,
    ...validate(startReviewValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const review = await service.startReview(req.params.orderId, authReq.user.userId);
      res.status(200).json({ status: 200, data: review });
    }),
  );

  // 5. PATCH /order-reviews/:orderId/approve — Approve
  router.patch(
    '/:orderId/approve',
    auth() as never,
    check('reviews', 'update') as never,
    ...validate(approveReviewValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const review = await service.approveReview(req.params.orderId, authReq.user.userId);

      // RVW-INV-04: Audit log for approval
      auditLog.log({
        actor: authReq.user.userId,
        actorType: 'senior_staff',
        action: 'status_change',
        resource: 'review',
        resourceId: review._id.toString(),
        description: `Return approved by reviewer. Round: ${review.reviewRound}. Time: ${review.timeToReview}min`,
        severity: 'info',
      });

      res.status(200).json({ status: 200, data: review });
    }),
  );

  // 6. PATCH /order-reviews/:orderId/request-changes — Request changes
  router.patch(
    '/:orderId/request-changes',
    auth() as never,
    check('reviews', 'update') as never,
    ...validate(requestChangesValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { changesRequested, reviewNotes } = req.body as {
        changesRequested: IChangeRequest[];
        reviewNotes?: string;
      };
      const review = await service.requestChanges(
        req.params.orderId,
        authReq.user.userId,
        changesRequested,
        reviewNotes,
      );

      auditLog.log({
        actor: authReq.user.userId,
        actorType: 'senior_staff',
        action: 'status_change',
        resource: 'review',
        resourceId: review._id.toString(),
        description: `Changes requested: ${changesRequested.length} item(s). Round: ${review.reviewRound}`,
        severity: 'warning',
      });

      res.status(200).json({ status: 200, data: review });
    }),
  );

  // 7. PATCH /order-reviews/:orderId/reject — Reject
  router.patch(
    '/:orderId/reject',
    auth() as never,
    check('reviews', 'update') as never,
    ...validate(rejectReviewValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { rejectedReason } = req.body as { rejectedReason: string };
      const review = await service.rejectReview(
        req.params.orderId,
        authReq.user.userId,
        rejectedReason,
      );

      auditLog.log({
        actor: authReq.user.userId,
        actorType: 'senior_staff',
        action: 'status_change',
        resource: 'review',
        resourceId: review._id.toString(),
        description: `Return rejected: ${rejectedReason}`,
        severity: 'critical',
      });

      res.status(200).json({ status: 200, data: review });
    }),
  );

  // Fix for B-3.14, G-3.4: PATCH /order-reviews/:orderId/checklist — Update checklist item
  router.patch(
    '/:orderId/checklist',
    auth() as never,
    check('reviews', 'update') as never,
    ...validate(updateChecklistValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { index, checked, note } = req.body as { index: number; checked: boolean; note?: string };
      const review = await service.updateChecklist(
        req.params.orderId,
        index,
        checked,
        authReq.user.userId,
        note,
      );
      res.status(200).json({ status: 200, data: review });
    }),
  );

  // 8. POST /order-reviews/:orderId/resolve-change — Resolve a change
  router.post(
    '/:orderId/resolve-change',
    auth() as never,
    check('reviews', 'update') as never,
    ...validate(resolveChangeValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { changeIndex } = req.body as { changeIndex: number };
      const review = await service.resolveChange(
        req.params.orderId,
        changeIndex,
        authReq.user.userId,
      );
      res.status(200).json({ status: 200, data: review });
    }),
  );

  return router;
}
