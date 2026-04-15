import { Router, type Request, type Response, type RequestHandler } from 'express';
import { asyncHandler } from '@nugen/error-handler';
import { validate } from '@nugen/validator';
import * as auditLog from '@nugen/audit-log';
import type { ReviewRouteDeps } from './review.types';
import {
  initReviewService,
  requestReview,
  submitReview,
  logGoogleClick,
  respondToReview,
  listReviews,
  getPublicReviews,
  getStats,
  sendReviewReminders,
} from './review.service';
import {
  validateRequestReview,
  validateSubmitReview,
  validateRespondReview,
  validateReviewId,
  validateListReviews,
} from './review.validators';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    userType: number;
    roleId: string;
  };
}

export function createReviewRoutes(deps: ReviewRouteDeps): Router {
  const router = Router();
  const { authenticate, checkPermission } = deps;

  initReviewService({
    ReviewModel: deps.ReviewModel,
    OrderModel: deps.OrderModel,
    UserModel: deps.UserModel,
  });

  // ─── POST /request/:orderId — Request review (system/admin) ──────────────
  router.post(
    '/request/:orderId',
    authenticate() as RequestHandler,
    checkPermission('reviews', 'create') as RequestHandler,
    ...validate(validateRequestReview()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const review = await requestReview(req.params.orderId);

      await auditLog.logFromRequest(req, {
        action: 'create',
        resource: 'review',
        resourceId: review._id.toString(),
        description: `Review requested for order ${req.params.orderId}`,
        severity: 'low',
      });

      res.status(201).json({ status: 201, data: review });
    }),
  );

  // ─── POST /submit — Submit review (client) ───────────────────────────────
  router.post(
    '/submit',
    authenticate() as RequestHandler,
    ...validate(validateSubmitReview()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { orderId, rating, npsScore, comment, tags } = req.body as {
        orderId: string; rating: number; npsScore?: number;
        comment?: string; tags?: string[];
      };

      const { review, googlePrompt } = await submitReview({
        orderId,
        userId: authReq.user.userId,
        rating,
        npsScore,
        comment,
        tags,
      });

      await auditLog.logFromRequest(req, {
        action: 'create',
        resource: 'review',
        resourceId: review._id.toString(),
        description: `Review submitted: rating ${rating}/5 for order ${orderId}`,
        severity: 'low',
      });

      res.status(200).json({ status: 200, data: { review, googlePrompt } });
    }),
  );

  // ─── GET / — List reviews (admin) ─────────────────────────────────────────
  router.get(
    '/',
    authenticate() as RequestHandler,
    checkPermission('reviews', 'read') as RequestHandler,
    ...validate(validateListReviews()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { page = 1, limit = 20, status, rating, staffId } = req.query as {
        page?: number; limit?: number; status?: string;
        rating?: number; staffId?: string;
      };

      const pageNum = Number(page);
      const limitNum = Number(limit);

      const { reviews, total } = await listReviews({
        status, rating: rating ? Number(rating) : undefined,
        staffId, page: pageNum, limit: limitNum,
      });

      res.status(200).json({
        status: 200,
        data: reviews,
        pagination: {
          page: pageNum, limit: limitNum, total,
          totalPages: Math.ceil(total / limitNum),
          hasNext: pageNum * limitNum < total,
          hasPrev: pageNum > 1,
        },
      });
    }),
  );

  // ─── PUT /:id/respond — Admin respond to review ──────────────────────────
  router.put(
    '/:id/respond',
    authenticate() as RequestHandler,
    checkPermission('reviews', 'update') as RequestHandler,
    ...validate(validateRespondReview()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { response } = req.body as { response: string };

      const review = await respondToReview(
        req.params.id,
        authReq.user.userId,
        response,
      );

      await auditLog.logFromRequest(req, {
        action: 'update',
        resource: 'review',
        resourceId: review._id.toString(),
        description: `Admin responded to review ${req.params.id}`,
        severity: 'medium',
      });

      res.status(200).json({ status: 200, data: review });
    }),
  );

  // ─── GET /stats — Review statistics (admin) ──────────────────────────────
  router.get(
    '/stats',
    authenticate() as RequestHandler,
    checkPermission('reviews', 'read') as RequestHandler,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const stats = await getStats();
      res.status(200).json({ status: 200, data: stats });
    }),
  );

  // ─── POST /:id/google-prompt — Log Google review click (client) ──────────
  router.post(
    '/:id/google-prompt',
    authenticate() as RequestHandler,
    ...validate(validateReviewId()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const review = await logGoogleClick(req.params.id, authReq.user.userId);
      res.status(200).json({ status: 200, data: review });
    }),
  );

  // ─── GET /public — Public reviews ─────────────────────────────────────────
  // REV-INV-04: No DELETE endpoint for reviews
  router.get(
    '/public',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { page = 1, limit = 10 } = req.query as { page?: number; limit?: number };
      const pageNum = Number(page);
      const limitNum = Number(limit);

      const { reviews, total } = await getPublicReviews(pageNum, limitNum);

      res.status(200).json({
        status: 200,
        data: reviews,
        pagination: {
          page: pageNum, limit: limitNum, total,
          totalPages: Math.ceil(total / limitNum),
          hasNext: pageNum * limitNum < total,
          hasPrev: pageNum > 1,
        },
      });
    }),
  );

  return router;
}

// ─── Cron Export ────────────────────────────────────────────────────────────

export { sendReviewReminders };
