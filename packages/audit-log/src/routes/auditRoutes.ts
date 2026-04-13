import { Router, type Request, type Response } from 'express';
import type { Model } from 'mongoose';
import { asyncHandler } from '@nugen/error-handler';
import { validate, pagination, dateRange } from '@nugen/validator';
import type { IAuditLogDocument } from '../types';

export interface AuditRouteDeps {
  AuditLogModel: Model<IAuditLogDocument>;
  authenticate: () => unknown;
  checkPermission: (resource: string, action: string) => unknown;
}

export function createAuditRoutes(deps: AuditRouteDeps): Router {
  const router = Router();
  const { AuditLogModel, authenticate: auth, checkPermission: check } = deps;

  // --- POST /audit-logs/query (query) ---
  // Also mounted at POST / for backward compatibility
  const queryMiddleware = [
    auth() as never,
    check('audit_logs', 'read') as never,
    ...validate([...pagination(), ...dateRange()]),
  ];

  const queryHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const body = req.body as Record<string, unknown>;
    const page = parseInt(body.page as string) || parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(body.limit as string) || parseInt(req.query.limit as string) || 20, 100);
    const skip = (page - 1) * limit;

    const {
      actor, actorType, action, resource, resourceId, severity,
      dateFrom, dateTo, search: searchTerm,
    } = req.body as Record<string, string | undefined>;

    const filter: Record<string, unknown> = {};
    if (actor) { filter.actor = actor; }
    if (actorType) { filter.actorType = actorType; }
    if (action) { filter.action = action; }
    if (resource) { filter.resource = resource; }
    if (resourceId) { filter.resourceId = resourceId; }
    if (severity) { filter.severity = severity; }

    if (dateFrom || dateTo) {
      filter.timestamp = {};
      if (dateFrom) { (filter.timestamp as Record<string, unknown>).$gte = new Date(dateFrom); }
      if (dateTo) { (filter.timestamp as Record<string, unknown>).$lte = new Date(dateTo); }
    }

    // FIX for Vegeta S-6: Use $text search with text index instead of $regex (prevents ReDoS)
    if (searchTerm) {
      filter.$text = { $search: searchTerm };
    }

    const [logs, total] = await Promise.all([
      AuditLogModel.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .populate('actor', 'firstName lastName email')
        .lean(),
      AuditLogModel.countDocuments(filter),
    ]);

    res.status(200).json({
      status: 200,
      data: logs,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });

  router.post('/', ...queryMiddleware, queryHandler);
  router.post('/query', ...queryMiddleware, queryHandler);

  // --- POST /audit-logs/export ---
  router.post(
    '/export',
    auth() as never,
    check('audit_logs', 'export') as never,
    ...validate([...dateRange()]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { dateFrom, dateTo, resource, severity } = req.body as Record<string, string | undefined>;

      const filter: Record<string, unknown> = {};
      if (resource) { filter.resource = resource; }
      if (severity) { filter.severity = severity; }
      if (dateFrom || dateTo) {
        filter.timestamp = {};
        if (dateFrom) { (filter.timestamp as Record<string, unknown>).$gte = new Date(dateFrom); }
        if (dateTo) { (filter.timestamp as Record<string, unknown>).$lte = new Date(dateTo); }
      }

      // FIX for Vegeta G-5: Use cursor-based streaming for large exports
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-log-export.json"');
      res.write('[\n');

      const cursor = AuditLogModel.find(filter)
        .sort({ timestamp: -1 })
        .cursor();

      let first = true;
      for await (const doc of cursor) {
        if (!first) {
          res.write(',\n');
        }
        res.write(JSON.stringify(doc));
        first = false;
      }

      res.write('\n]');
      res.end();
    }),
  );

  // --- GET /audit-logs/stats ---
  router.get(
    '/stats',
    auth() as never,
    check('audit_logs', 'read') as never,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [actionsPerDay, topActors, criticalCount, failedLogins] = await Promise.all([
        AuditLogModel.aggregate([
          { $match: { timestamp: { $gte: thirtyDaysAgo } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: -1 } },
          { $limit: 30 },
        ]),
        AuditLogModel.aggregate([
          { $match: { timestamp: { $gte: thirtyDaysAgo } } },
          { $group: { _id: '$actor', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
        AuditLogModel.countDocuments({
          severity: 'critical',
          timestamp: { $gte: thirtyDaysAgo },
        }),
        AuditLogModel.countDocuments({
          action: 'login_failed',
          timestamp: { $gte: thirtyDaysAgo },
        }),
      ]);

      res.status(200).json({
        status: 200,
        data: { actionsPerDay, topActors, criticalCount, failedLogins },
      });
    }),
  );

  return router;
}
