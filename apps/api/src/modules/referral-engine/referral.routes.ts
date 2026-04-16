import { Router, type Request, type Response, type RequestHandler } from 'express';
import { asyncHandler } from '@nugen/error-handler';
import { validate } from '@nugen/validator';
import * as auditLog from '@nugen/audit-log';
import type { ReferralRouteDeps } from './referral.types';
import {
  initReferralService,
  getOrGenerateCode,
  validateCode,
  applyReferral,
  processReward,
  listMyReferrals,
  getDashboard,
  getLeaderboard,
  getReferralConfig,
  updateReferralConfig,
  expireStaleReferrals,
  expireCreditRewards,
} from './referral.service';
import {
  validateShare,
  validateApply,
  validateCode as validateCodeParam,
  validateConfigUpdate,
  validateListParams,
} from './referral.validators';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    userType: number;
    roleId: string;
  };
}

export function createReferralRoutes(deps: ReferralRouteDeps): Router {
  const router = Router();
  const { authenticate, checkPermission } = deps;

  initReferralService({
    ReferralModel: deps.ReferralModel,
    ReferralConfigModel: deps.ReferralConfigModel,
    UserModel: deps.UserModel,
    OrderModel: deps.OrderModel,
    LeadModel: deps.LeadModel,
    CounterModel: deps.CounterModel,
    creditService: deps.creditService,
  });

  // ─── GET /my-code — Get or generate referral code (client) ────────────────
  router.get(
    '/my-code',
    authenticate() as RequestHandler,
    checkPermission('referrals', 'read') as RequestHandler,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const code = await getOrGenerateCode(authReq.user.userId);
      res.status(200).json({ status: 200, data: { referralCode: code } });
    }),
  );

  // ─── POST /share — Record share action (client) ──────────────────────────
  router.post(
    '/share',
    authenticate() as RequestHandler,
    checkPermission('referrals', 'create') as RequestHandler,
    ...validate(validateShare()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const code = await getOrGenerateCode(authReq.user.userId);

      await auditLog.logFromRequest(req, {
        action: 'create',
        resource: 'referral_share',
        resourceId: authReq.user.userId,
        description: `Referral code shared via ${req.body.channel}`,
        severity: 'low',
      });

      res
        .status(200)
        .json({ status: 200, data: { referralCode: code, channel: req.body.channel } });
    }),
  );

  // ─── GET /validate/:code — Validate referral code (public) ────────────────
  router.get(
    '/validate/:code',
    ...validate(validateCodeParam()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const result = await validateCode(req.params.code);
      res.status(200).json({ status: 200, data: result });
    }),
  );

  // ─── POST /apply — Apply referral code (system) ──────────────────────────
  router.post(
    '/apply',
    authenticate() as RequestHandler,
    ...validate(validateApply()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { referralCode, refereeUserId, refereeLeadId } = req.body as {
        referralCode: string;
        refereeUserId: string;
        refereeLeadId?: string;
      };

      const referral = await applyReferral(referralCode, refereeUserId, refereeLeadId);

      await auditLog.logFromRequest(req, {
        action: 'create',
        resource: 'referral',
        resourceId: referral._id.toString(),
        description: `Referral applied: code ${referralCode} for user ${refereeUserId}`,
        severity: 'medium',
      });

      res.status(201).json({ status: 201, data: referral });
    }),
  );

  // ─── GET /my-referrals — List my referrals (client) ──────────────────────
  router.get(
    '/my-referrals',
    authenticate() as RequestHandler,
    checkPermission('referrals', 'read') as RequestHandler,
    ...validate(validateListParams()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { page = 1, limit = 20 } = req.query as { page?: number; limit?: number };
      const pageNum = Number(page);
      const limitNum = Number(limit);

      const { referrals, total } = await listMyReferrals(authReq.user.userId, pageNum, limitNum);

      res.status(200).json({
        status: 200,
        data: referrals,
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

  // ─── POST /process-reward — Process reward for order (staff/system) ──────
  // Gated behind referrals:update — issues real money (credits). Clients must
  // never call this directly; order completion flow or cron triggers it.
  router.post(
    '/process-reward',
    authenticate() as RequestHandler,
    checkPermission('referrals', 'update') as RequestHandler,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { orderId } = req.body as { orderId: string };
      const referral = await processReward(orderId);

      if (referral) {
        await auditLog.logFromRequest(req, {
          action: 'update',
          resource: 'referral',
          resourceId: referral._id.toString(),
          description: `Referral reward processed for order ${orderId}`,
          severity: 'medium',
        });
      }

      res.status(200).json({ status: 200, data: { rewarded: !!referral, referral } });
    }),
  );

  // ─── GET /config — Get referral config (admin) ───────────────────────────
  router.get(
    '/config',
    authenticate() as RequestHandler,
    checkPermission('referrals', 'read') as RequestHandler,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const config = await getReferralConfig();
      res.status(200).json({ status: 200, data: config });
    }),
  );

  // ─── PUT /config — Update referral config (admin) ────────────────────────
  router.put(
    '/config',
    authenticate() as RequestHandler,
    checkPermission('referrals', 'update') as RequestHandler,
    ...validate(validateConfigUpdate()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const config = await updateReferralConfig(req.body);

      await auditLog.logFromRequest(req, {
        action: 'update',
        resource: 'referral_config',
        resourceId: config._id.toString(),
        description: 'Referral configuration updated',
        severity: 'high',
      });

      res.status(200).json({ status: 200, data: config });
    }),
  );

  // ─── GET /dashboard — Admin dashboard ────────────────────────────────────
  router.get(
    '/dashboard',
    authenticate() as RequestHandler,
    checkPermission('referrals', 'read') as RequestHandler,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const dashboard = await getDashboard();
      res.status(200).json({ status: 200, data: dashboard });
    }),
  );

  // ─── GET /leaderboard — Referral leaderboard (client) ────────────────────
  router.get(
    '/leaderboard',
    authenticate() as RequestHandler,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const leaderboard = await getLeaderboard(limit);
      res.status(200).json({ status: 200, data: leaderboard });
    }),
  );

  return router;
}

// ─── Cron Exports ───────────────────────────────────────────────────────────

export { expireStaleReferrals, expireCreditRewards };
