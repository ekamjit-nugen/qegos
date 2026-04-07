import { Router, type Request, type Response, type RequestHandler } from 'express';
import type { Model } from 'mongoose';
import { asyncHandler } from '@nugen/error-handler';
import { validate } from '@nugen/validator';
import * as auditLog from '@nugen/audit-log';
import type { IReviewAssignmentDocument, IChangeRequest } from './review.types';
import { createReviewService } from './review.service';
import {
  submitForReviewValidation,
  startReviewValidation,
  approveReviewValidation,
  requestChangesValidation,
  rejectReviewValidation,
  resolveChangeValidation,
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
  OrderModel: Model<Record<string, unknown>>;
  UserModel: Model<Record<string, unknown>>;
  authenticate: () => RequestHandler;
  checkPermission: (resource: string, action: string) => RequestHandler;
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
    check('order-reviews', 'create') as never,
    ...validate(submitForReviewValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { orderId } = req.body as { orderId: string };
      const review = await service.submitForReview(orderId, authReq.user.userId);

      void auditLog.log({
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

  // 2. GET /order-reviews/pending — My pending reviews
  router.get(
    '/pending',
    auth() as never,
    check('order-reviews', 'read') as never,
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
    check('order-reviews', 'read') as never,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const stats = await service.getStats();
      res.status(200).json({ status: 200, data: stats });
    }),
  );

  // 3. GET /order-reviews/:orderId — Review detail
  router.get(
    '/:orderId',
    auth() as never,
    check('order-reviews', 'read') as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const review = await service.getReviewDetail(req.params.orderId);
      res.status(200).json({ status: 200, data: review });
    }),
  );

  // 4. PATCH /order-reviews/:orderId/start — Start reviewing
  router.patch(
    '/:orderId/start',
    auth() as never,
    check('order-reviews', 'update') as never,
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
    check('order-reviews', 'update') as never,
    ...validate(approveReviewValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const review = await service.approveReview(req.params.orderId, authReq.user.userId);

      // RVW-INV-04: Audit log for approval
      void auditLog.log({
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
    check('order-reviews', 'update') as never,
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

      void auditLog.log({
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
    check('order-reviews', 'update') as never,
    ...validate(rejectReviewValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { rejectedReason } = req.body as { rejectedReason: string };
      const review = await service.rejectReview(
        req.params.orderId,
        authReq.user.userId,
        rejectedReason,
      );

      void auditLog.log({
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

  // 8. POST /order-reviews/:orderId/resolve-change — Resolve a change
  router.post(
    '/:orderId/resolve-change',
    auth() as never,
    check('order-reviews', 'update') as never,
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
