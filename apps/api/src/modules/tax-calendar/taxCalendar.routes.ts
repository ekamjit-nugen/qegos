import { Router, type Request, type Response, type RequestHandler } from 'express';
import { asyncHandler } from '@nugen/error-handler';
import { validate } from '@nugen/validator';
import * as auditLog from '@nugen/audit-log';
import type { TaxCalendarRouteDeps } from './taxCalendar.types';
import {
  initCalendarService,
  getUpcomingDeadlines,
  listDeadlines,
  createDeadline,
  updateDeadline,
  processReminders,
} from './taxCalendar.service';
import { seedTaxDeadlines } from './taxCalendar.seed';
import {
  validateCreateDeadline,
  validateUpdateDeadline,
  validateDeadlineId,
  validateListParams,
} from './taxCalendar.validators';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    userType: number;
    roleId: string;
    clientType?: string;
  };
}

export function createCalendarRoutes(deps: TaxCalendarRouteDeps): Router {
  const router = Router();
  const { authenticate, checkPermission } = deps;

  initCalendarService({
    TaxDeadlineModel: deps.TaxDeadlineModel,
    DeadlineReminderModel: deps.DeadlineReminderModel,
    OrderModel: deps.OrderModel,
    UserModel: deps.UserModel,
  });

  // ─── GET /upcoming — Next 3 deadlines for client ─────────────────────────
  router.get(
    '/upcoming',
    authenticate() as RequestHandler,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const deadlines = await getUpcomingDeadlines(
        authReq.user.userId,
        authReq.user.clientType,
      );
      res.status(200).json({ status: 200, data: deadlines });
    }),
  );

  // ─── GET /deadlines — List all deadlines ──────────────────────────────────
  router.get(
    '/deadlines',
    authenticate() as RequestHandler,
    checkPermission('calendar', 'read') as RequestHandler,
    ...validate(validateListParams()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { page = 1, limit = 20, financialYear, type, applicableTo, isActive } = req.query as {
        page?: number; limit?: number; financialYear?: string;
        type?: string; applicableTo?: string; isActive?: boolean;
      };

      const pageNum = Number(page);
      const limitNum = Number(limit);

      const { deadlines, total } = await listDeadlines({
        financialYear, type, applicableTo, isActive,
        page: pageNum, limit: limitNum,
      });

      res.status(200).json({
        status: 200,
        data: deadlines,
        pagination: {
          page: pageNum, limit: limitNum, total,
          totalPages: Math.ceil(total / limitNum),
          hasNext: pageNum * limitNum < total,
          hasPrev: pageNum > 1,
        },
      });
    }),
  );

  // ─── POST /deadlines — Create custom deadline (admin) ────────────────────
  router.post(
    '/deadlines',
    authenticate() as RequestHandler,
    checkPermission('calendar', 'create') as RequestHandler,
    ...validate(validateCreateDeadline()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const deadline = await createDeadline(req.body);

      await auditLog.logFromRequest(req, {
        action: 'create',
        resource: 'tax_deadline',
        resourceId: deadline._id.toString(),
        description: `Tax deadline created: ${deadline.title}`,
        severity: 'medium',
      });

      res.status(201).json({ status: 201, data: deadline });
    }),
  );

  // ─── PUT /deadlines/:id — Update deadline (admin) ────────────────────────
  router.put(
    '/deadlines/:id',
    authenticate() as RequestHandler,
    checkPermission('calendar', 'update') as RequestHandler,
    ...validate(validateUpdateDeadline()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const deadline = await updateDeadline(req.params.id, req.body);

      await auditLog.logFromRequest(req, {
        action: 'update',
        resource: 'tax_deadline',
        resourceId: deadline._id.toString(),
        description: `Tax deadline updated: ${deadline.title}`,
        severity: 'medium',
      });

      res.status(200).json({ status: 200, data: deadline });
    }),
  );

  // ─── POST /seed — Seed standard ATO deadlines (admin) ────────────────────
  router.post(
    '/seed',
    authenticate() as RequestHandler,
    checkPermission('calendar', 'create') as RequestHandler,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { financialYear } = req.body as { financialYear: string };
      if (!financialYear || !/^\d{4}-\d{4}$/.test(financialYear)) {
        res.status(400).json({
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'financialYear is required in YYYY-YYYY format',
        });
        return;
      }

      const seeded = await seedTaxDeadlines(deps.TaxDeadlineModel, financialYear);

      await auditLog.logFromRequest(req, {
        action: 'create',
        resource: 'tax_deadline',
        resourceId: financialYear,
        description: `Seeded ${seeded} standard ATO deadlines for ${financialYear}`,
        severity: 'medium',
      });

      res.status(201).json({ status: 201, data: { seeded, financialYear } });
    }),
  );

  // ─── POST /process-reminders — Cron: process deadline reminders ───────────
  router.post(
    '/process-reminders',
    authenticate() as RequestHandler,
    checkPermission('calendar', 'update') as RequestHandler,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const sentCount = await processReminders();

      await auditLog.logFromRequest(req, {
        action: 'execute',
        resource: 'deadline_reminders',
        resourceId: 'cron',
        description: `Processed deadline reminders: ${sentCount} sent`,
        severity: 'low',
      });

      res.status(200).json({ status: 200, data: { sent: sentCount } });
    }),
  );

  return router;
}

// ─── Cron Export ────────────────────────────────────────────────────────────

export { processReminders };
