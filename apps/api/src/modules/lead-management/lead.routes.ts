import { Router, type Request, type Response, type RequestHandler } from 'express';
import { param } from 'express-validator';
import type { Model, Connection } from 'mongoose';
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
import type { ILeadDocument, ILeadActivityDocument, ILeadReminderDocument } from './lead.types';
import { createLeadService } from './lead.service';
import { createLeadActivityService } from './leadActivity.service';
import { createLeadReminderService } from './leadReminder.service';
import {
  createLeadValidation,
  updateLeadValidation,
  statusTransitionValidation,
  assignLeadValidation,
  bulkAssignValidation,
  bulkStatusValidation,
  mergeLeadValidation,
  checkDuplicateValidation,
  convertLeadValidation,
  convertExistingValidation,
  logActivityValidation,
  updateActivityValidation,
  logCallValidation,
  createReminderValidation,
  snoozeReminderValidation,
  listLeadValidation,
  searchLeadValidation,
  importLeadValidation,
  exportLeadValidation,
} from './lead.validators';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    userType: number;
    roleId: string;
  };
  scopeFilter?: Record<string, unknown>;
}

export interface LeadRouteDeps {
  LeadModel: Model<ILeadDocument>;
  LeadActivityModel: Model<ILeadActivityDocument>;
  LeadReminderModel: Model<ILeadReminderDocument>;
  connection: Connection;
  CounterModel?: Model<import('../../database/counter.model').ICounterDocument>;
  UserModel?: Model<any>;
  OrderModel?: Model<any>;
  authenticate: () => RequestHandler;
  checkPermission: CheckPermissionFn;
}

export function createLeadRoutes(deps: LeadRouteDeps): Router {
  const router = Router();
  const {
    LeadModel, LeadActivityModel, LeadReminderModel,
    connection, authenticate: auth, checkPermission: check,
  } = deps;

  const leadService = createLeadService({
    LeadModel, LeadActivityModel, LeadReminderModel, connection,
    CounterModel: deps.CounterModel,
    UserModel: deps.UserModel,
    OrderModel: deps.OrderModel,
  });

  const activityService = createLeadActivityService({
    LeadModel,
    LeadActivityModel,
    recalculateScore: leadService.calculateScore,
  });

  const reminderService = createLeadReminderService({ LeadModel, LeadReminderModel });

  // ──────────────────────────────────────────────────────────────────────
  // STATS (must be before :id routes to avoid param conflicts)
  // ──────────────────────────────────────────────────────────────────────

  // 28. GET /leads/stats/dashboard
  router.get(
    '/stats/dashboard',
    auth() as never,
    check('leads', 'read') as never,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const stats = await leadService.getStats();
      res.status(200).json({ status: 200, data: stats });
    }),
  );

  // 29. GET /leads/stats/pipeline
  router.get(
    '/stats/pipeline',
    auth() as never,
    check('leads', 'read') as never,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const stats = await leadService.getPipelineStats();
      res.status(200).json({ status: 200, data: stats });
    }),
  );

  // 30. GET /leads/stats/staff
  router.get(
    '/stats/staff',
    auth() as never,
    check('leads', 'read') as never,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const stats = await leadService.getStaffStats();
      res.status(200).json({ status: 200, data: stats });
    }),
  );

  // 31. GET /leads/stats/source
  router.get(
    '/stats/source',
    auth() as never,
    check('leads', 'read') as never,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const stats = await leadService.getSourceStats();
      res.status(200).json({ status: 200, data: stats });
    }),
  );

  // 32. GET /leads/stats/aging
  router.get(
    '/stats/aging',
    auth() as never,
    check('leads', 'read') as never,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const stats = await leadService.getAgingStats();
      res.status(200).json({ status: 200, data: stats });
    }),
  );

  // ──────────────────────────────────────────────────────────────────────
  // LEAD CRUD
  // ──────────────────────────────────────────────────────────────────────

  // 1. POST /leads — Create lead with duplicate check
  router.post(
    '/',
    auth() as never,
    check('leads', 'create') as never,
    ...validate(createLeadValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const result = await leadService.createLead(
        req.body as Partial<ILeadDocument>,
        authReq.user.userId,
      );

      auditLog.log({
        actor: authReq.user.userId,
        actorType: 'staff',
        action: 'create',
        resource: 'lead',
        resourceId: result.lead._id.toString(),
        resourceNumber: result.lead.leadNumber,
        severity: 'info',
      });

      res.status(201).json({
        status: 201,
        data: result.lead,
        isDuplicate: result.isDuplicate,
        duplicateMatches: result.duplicateMatches,
      });
    }),
  );

  // 2. GET /leads — List with filters
  router.get(
    '/',
    auth() as never,
    check('leads', 'read') as never,
    ...validate(listLeadValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const result = await leadService.listLeads({
        ...req.query as Record<string, string>,
        scopeFilter: authReq.scopeFilter,
      });
      res.status(200).json({
        status: 200,
        data: result.leads,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    }),
  );

  // 9. POST /leads/import — Two-pass JSON import (Phase 4)
  router.post(
    '/import',
    auth() as never,
    check('leads', 'create') as never,
    ...validate(importLeadValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { rows } = req.body as { rows: Array<{ firstName: string; mobile: string; [key: string]: string | undefined }> };
      const result = await leadService.importLeads(rows, authReq.user.userId);

      if (result.validationErrors && result.validationErrors.length > 0) {
        res.status(422).json({
          status: 422,
          code: 'IMPORT_VALIDATION_FAILED',
          message: `${result.validationErrors.length} row(s) failed validation. No leads were imported.`,
          errors: result.validationErrors,
        });
        return;
      }

      auditLog.log({
        actor: authReq.user.userId,
        actorType: 'staff',
        action: 'lead.bulk_import',
        resource: 'lead',
        resourceId: 'bulk',
        description: `Imported ${result.imported} leads`,
        severity: 'medium',
      });

      res.status(201).json({
        status: 201,
        data: { imported: result.imported },
      });
    }),
  );

  // 10. GET /leads/export — CSV export (Phase 4)
  router.get(
    '/export',
    auth() as never,
    check('leads', 'read') as never,
    ...validate(exportLeadValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const data = await leadService.exportLeads({
        status: req.query.status ? parseInt(req.query.status as string) : undefined,
        priority: req.query.priority as string | undefined,
        source: req.query.source as string | undefined,
        assignedTo: req.query.assignedTo as string | undefined,
        state: req.query.state as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        scopeFilter: authReq.scopeFilter,
      });

      if (data.length === 0) {
        res.status(200).json({ status: 200, data: [] });
        return;
      }

      // Return as CSV
      const headers = Object.keys(data[0]);
      const csvLines = [
        headers.join(','),
        ...data.map((row) =>
          headers.map((h) => {
            const val = String(row[h] ?? '');
            // Escape CSV values containing commas or quotes
            return val.includes(',') || val.includes('"')
              ? `"${val.replace(/"/g, '""')}"`
              : val;
          }).join(','),
        ),
      ];

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=leads-export.csv');
      res.status(200).send(csvLines.join('\n'));
    }),
  );

  // 11. POST /leads/search — Full-text search
  router.post(
    '/search',
    auth() as never,
    check('leads', 'read') as never,
    ...validate(searchLeadValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { query: searchQuery } = req.body as { query: string };
      const results = await leadService.searchLeads(searchQuery, authReq.scopeFilter);
      res.status(200).json({ status: 200, data: results });
    }),
  );

  // 11b. POST /leads/bulk-score — Recalculate scores for all active leads (Phase 4)
  router.post(
    '/bulk-score',
    auth() as never,
    check('leads', 'update') as never,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const result = await leadService.bulkScore();
      res.status(200).json({
        status: 200,
        data: result,
        meta: { message: `Scored ${result.processed} leads with ${result.errors} errors` },
      });
    }),
  );

  // 12. POST /leads/check-duplicate
  router.post(
    '/check-duplicate',
    auth() as never,
    check('leads', 'read') as never,
    ...validate(checkDuplicateValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { mobile, email } = req.body as { mobile?: string; email?: string };
      const matches = await leadService.checkDuplicate(mobile, email);
      res.status(200).json({ status: 200, data: { matches, count: matches.length } });
    }),
  );

  // 13. POST /leads/merge
  router.post(
    '/merge',
    auth() as never,
    check('leads', 'update') as never,
    ...validate(mergeLeadValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { primaryLeadId, secondaryLeadId, fieldSelections } = req.body as {
        primaryLeadId: string;
        secondaryLeadId: string;
        fieldSelections: Record<string, 'primary' | 'secondary'>;
      };
      const merged = await leadService.mergeLead(primaryLeadId, secondaryLeadId, fieldSelections);

      auditLog.log({
        actor: authReq.user.userId,
        actorType: 'admin',
        action: 'merge',
        resource: 'lead',
        resourceId: primaryLeadId,
        description: `Merged lead ${secondaryLeadId} into ${primaryLeadId}`,
        severity: 'warning',
      });

      res.status(200).json({ status: 200, data: merged });
    }),
  );

  // 7. PUT /leads/bulk-assign
  router.put(
    '/bulk-assign',
    auth() as never,
    check('leads', 'update') as never,
    ...validate(bulkAssignValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { leadIds, assignedTo } = req.body as { leadIds: string[]; assignedTo: string };
      const result = await leadService.bulkAssign(leadIds, assignedTo, authReq.user.userId);

      auditLog.log({
        actor: authReq.user.userId,
        actorType: 'admin',
        action: 'bulk_action',
        resource: 'lead',
        resourceId: assignedTo,
        description: `Bulk assigned ${leadIds.length} leads`,
        severity: 'info',
      });

      res.status(200).json({ status: 200, data: result });
    }),
  );

  // 8. PATCH /leads/bulk-status
  router.patch(
    '/bulk-status',
    auth() as never,
    check('leads', 'update') as never,
    ...validate(bulkStatusValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { leadIds, status, lostReason, lostReasonNote } = req.body as {
        leadIds: string[];
        status: number;
        lostReason?: string;
        lostReasonNote?: string;
      };
      const result = await leadService.bulkStatusChange(
        leadIds,
        status,
        { lostReason, lostReasonNote },
        authReq.user.userId,
      );
      res.status(200).json({ status: 200, data: result });
    }),
  );

  // ──────────────────────────────────────────────────────────────────────
  // ACTIVITIES (non-parameterized paths first)
  // ──────────────────────────────────────────────────────────────────────

  // 14. POST /leads/activities — Log activity
  router.post(
    '/activities',
    auth() as never,
    check('leads', 'update') as never,
    ...validate(logActivityValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const data = req.body as Partial<ILeadActivityDocument>;
      data.performedBy = authReq.user.userId as unknown as ILeadActivityDocument['performedBy'];
      const activity = await activityService.logActivity(data);
      res.status(201).json({ status: 201, data: activity });
    }),
  );

  // 17. POST /leads/log-call — Log call shortcut
  router.post(
    '/log-call',
    auth() as never,
    check('leads', 'update') as never,
    ...validate(logCallValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const data = req.body as {
        leadId: string;
        callDuration: number;
        callDirection: string;
        outcome?: string;
        description: string;
        nextAction?: string;
        nextActionDate?: string;
      };
      const activity = await activityService.logCall({
        ...data,
        performedBy: authReq.user.userId,
      });
      res.status(201).json({ status: 201, data: activity });
    }),
  );

  // 19. GET /leads/todays-calls
  router.get(
    '/todays-calls',
    auth() as never,
    check('leads', 'read') as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const calls = await activityService.getTodaysCalls(authReq.user.userId);
      res.status(200).json({ status: 200, data: calls });
    }),
  );

  // 16. PUT /leads/activities/:id — Edit activity
  router.put(
    '/activities/:id',
    auth() as never,
    check('leads', 'update') as never,
    ...validate(updateActivityValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const activity = await activityService.updateActivity(
        req.params.id,
        req.body as Partial<ILeadActivityDocument>,
      );
      res.status(200).json({ status: 200, data: activity });
    }),
  );

  // 18. GET /leads/staff/:staffId/activities — Staff activities
  router.get(
    '/staff/:staffId/activities',
    auth() as never,
    check('leads', 'read') as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const result = await activityService.getStaffActivities(
        req.params.staffId,
        req.query as { page?: number; limit?: number },
      );
      res.status(200).json({
        status: 200,
        data: result.activities,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    }),
  );

  // ──────────────────────────────────────────────────────────────────────
  // REMINDERS (non-parameterized paths first)
  // ──────────────────────────────────────────────────────────────────────

  // 20. POST /leads/reminders — Create reminder
  router.post(
    '/reminders',
    auth() as never,
    check('leads', 'update') as never,
    ...validate(createReminderValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const reminder = await reminderService.createReminder(
        req.body as Partial<ILeadReminderDocument>,
      );
      res.status(201).json({ status: 201, data: reminder });
    }),
  );

  // 22. GET /leads/reminders/today
  router.get(
    '/reminders/today',
    auth() as never,
    check('leads', 'read') as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const reminders = await reminderService.getTodayReminders(authReq.user.userId);
      res.status(200).json({ status: 200, data: reminders });
    }),
  );

  // 23. GET /leads/reminders/overdue
  router.get(
    '/reminders/overdue',
    auth() as never,
    check('leads', 'read') as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const reminders = await reminderService.getOverdueReminders(authReq.user.userId);
      res.status(200).json({ status: 200, data: reminders });
    }),
  );

  // 24. PATCH /leads/reminders/:id/complete
  router.patch(
    '/reminders/:id/complete',
    auth() as never,
    check('leads', 'update') as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const reminder = await reminderService.completeReminder(req.params.id);
      res.status(200).json({ status: 200, data: reminder });
    }),
  );

  // 25. PATCH /leads/reminders/:id/snooze
  router.patch(
    '/reminders/:id/snooze',
    auth() as never,
    check('leads', 'update') as never,
    ...validate(snoozeReminderValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { newDate, newTime } = req.body as { newDate: string; newTime: string };
      const reminder = await reminderService.snoozeReminder(req.params.id, newDate, newTime);
      res.status(200).json({ status: 200, data: reminder });
    }),
  );

  // ──────────────────────────────────────────────────────────────────────
  // PARAMETERIZED LEAD ROUTES (after all static routes)
  // ──────────────────────────────────────────────────────────────────────

  // 3. GET /leads/:id — Full detail
  // Fix for B-3.43: Validate :id is a valid MongoId
  router.get(
    '/:id',
    auth() as never,
    check('leads', 'read') as never,
    ...validate([param('id').isMongoId().withMessage('Invalid lead ID')]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const lead = await leadService.getLead(req.params.id, authReq.scopeFilter);
      res.status(200).json({ status: 200, data: lead });
    }),
  );

  // 4. PUT /leads/:id — Update
  router.put(
    '/:id',
    auth() as never,
    check('leads', 'update') as never,
    ...validate(updateLeadValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const lead = await leadService.updateLead(
        req.params.id,
        req.body as Partial<ILeadDocument>,
        authReq.scopeFilter,
      );

      auditLog.log({
        actor: authReq.user.userId,
        actorType: 'staff',
        action: 'update',
        resource: 'lead',
        resourceId: req.params.id,
        severity: 'info',
      });

      res.status(200).json({ status: 200, data: lead });
    }),
  );

  // 5. PATCH /leads/:id/status — Status transition
  router.patch(
    '/:id/status',
    auth() as never,
    check('leads', 'update') as never,
    ...validate(statusTransitionValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { status, lostReason, lostReasonNote, note } = req.body as {
        status: number;
        lostReason?: string;
        lostReasonNote?: string;
        note?: string;
      };
      const lead = await leadService.transitionStatus(
        req.params.id,
        status,
        { lostReason, lostReasonNote, note },
        authReq.user.userId,
        authReq.scopeFilter,
      );

      auditLog.log({
        actor: authReq.user.userId,
        actorType: 'staff',
        action: 'status_change',
        resource: 'lead',
        resourceId: req.params.id,
        description: `Status changed to ${status}`,
        severity: status === 7 ? 'warning' : 'info',
      });

      res.status(200).json({ status: 200, data: lead });
    }),
  );

  // 6. PUT /leads/:id/assign
  router.put(
    '/:id/assign',
    auth() as never,
    check('leads', 'update') as never,
    ...validate(assignLeadValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { assignedTo } = req.body as { assignedTo: string };
      // Fix for S-3.4, B-3.10: Pass scopeFilter to prevent IDOR
      const lead = await leadService.assignLead(req.params.id, assignedTo, authReq.user.userId, authReq.scopeFilter);

      auditLog.log({
        actor: authReq.user.userId,
        actorType: 'admin',
        action: 'assign',
        resource: 'lead',
        resourceId: req.params.id,
        description: `Assigned to ${assignedTo}`,
        severity: 'info',
      });

      res.status(200).json({ status: 200, data: lead });
    }),
  );

  // 15. GET /leads/:id/activities — Activity list
  router.get(
    '/:id/activities',
    auth() as never,
    check('leads', 'read') as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const result = await activityService.getActivities(
        req.params.id,
        req.query as { page?: number; limit?: number },
        authReq.scopeFilter,
      );
      res.status(200).json({
        status: 200,
        data: result.activities,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    }),
  );

  // 21. GET /leads/:id/reminders — Lead reminders
  router.get(
    '/:id/reminders',
    auth() as never,
    check('leads', 'read') as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const result = await reminderService.getReminders(req.params.id, authReq.scopeFilter);
      res.status(200).json({ status: 200, data: result.reminders, meta: { total: result.total } });
    }),
  );

  // Fix for B-3.31: DELETE /leads/:id — Soft delete
  router.delete(
    '/:id',
    auth() as never,
    check('leads', 'delete') as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const lead = await leadService.softDelete(req.params.id, authReq.scopeFilter);

      auditLog.log({
        actor: authReq.user.userId,
        actorType: 'admin',
        action: 'delete',
        resource: 'lead',
        resourceId: req.params.id,
        description: `Lead ${lead.leadNumber} soft-deleted`,
        severity: 'warning',
      });

      res.status(200).json({ status: 200, data: { message: 'Lead deleted' } });
    }),
  );

  // 26. POST /leads/:id/convert — Convert to user + order
  router.post(
    '/:id/convert',
    auth() as never,
    check('leads', 'update') as never,
    ...validate(convertLeadValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const result = await leadService.convertLead(req.params.id, authReq.user.userId);

      auditLog.log({
        actor: authReq.user.userId,
        actorType: 'staff',
        action: 'convert',
        resource: 'lead',
        resourceId: req.params.id,
        description: `Converted to order ${result.orderId}, user ${result.userId}`,
        severity: 'info',
      });

      res.status(200).json({ status: 200, data: result });
    }),
  );

  // 27. POST /leads/:id/convert-existing
  router.post(
    '/:id/convert-existing',
    auth() as never,
    check('leads', 'update') as never,
    ...validate(convertExistingValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { userId } = req.body as { userId: string };
      const result = await leadService.convertToExistingUser(
        req.params.id,
        userId,
        authReq.user.userId,
      );

      auditLog.log({
        actor: authReq.user.userId,
        actorType: 'staff',
        action: 'convert',
        resource: 'lead',
        resourceId: req.params.id,
        description: `Converted to existing user ${userId}, order ${result.orderId}`,
        severity: 'info',
      });

      res.status(200).json({ status: 200, data: result });
    }),
  );

  return router;
}
