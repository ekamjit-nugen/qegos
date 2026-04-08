import { Router } from 'express';
import { validationResult } from 'express-validator';
import type { Request, Response } from 'express';
import type { Redis } from 'ioredis';
import type { AnalyticsRouteDeps, DateRangeParams } from '../types';
import { DEFAULT_CACHE_TTL } from '../constants';
import { withCache, buildCacheKey } from '../services/cacheService';
import { getRevenueByPeriod, getCollectionRate } from '../services/revenueService';
import { getPipelineHealth } from '../services/pipelineHealthService';
import { getChurnRisk } from '../services/churnRiskService';
import { getSeasonalTrends } from '../services/seasonalTrendsService';
import { getServiceMix } from '../services/serviceMixService';
import { getClv } from '../services/clvService';
import { getStaffBenchmark } from '../services/staffBenchmarkService';
import { getChannelRoi } from '../services/channelRoiService';
import { getRevenueForecast } from '../services/forecastService';
import { getExecutiveSummary } from '../services/executiveSummaryService';
import { createExportJob } from '../services/exportService';
import {
  validateDateRange,
  validateClv,
  validateChannelRoi,
  validateExport,
  validateFinancialYear,
  validateGranularity,
} from '../validators/analyticsValidators';

function handleValidationErrors(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', errors: errors.array() });
    return true;
  }
  return false;
}

/**
 * Create analytics routes with dependency injection.
 * All routes require: authenticate() + checkPermission('analytics_dashboard', 'read')
 */
export function createAnalyticsRoutes(deps: AnalyticsRouteDeps): Router {
  const router = Router();
  const redis = deps.redisClient as Redis;
  const cacheTtl = deps.config.cacheTtlSeconds ?? DEFAULT_CACHE_TTL;

  const auth = [deps.authenticate(), deps.checkPermission('analytics_dashboard', 'read')];

  // 1. GET /executive-summary — ANA-INV-07: Read from Redis (pre-computed)
  router.get('/executive-summary', ...auth, async (_req: Request, res: Response) => {
    try {
      const summary = await getExecutiveSummary(redis);
      if (!summary) {
        res.status(503).json({ status: 503, code: 'SUMMARY_NOT_READY', message: 'Executive summary is being computed. Try again shortly.' });
        return;
      }
      res.json({ status: 200, data: summary });
    } catch (err) {
      res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
    }
  });

  // 2. GET /revenue-forecast
  router.get('/revenue-forecast', ...auth, ...validateDateRange(), async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;
    try {
      const dateRange = { dateFrom: req.query.dateFrom as string, dateTo: req.query.dateTo as string };
      const key = buildCacheKey('revenue-forecast', dateRange);
      const data = await withCache(redis, key, cacheTtl, () =>
        getRevenueForecast(deps.PaymentModel, deps.config, dateRange),
      );
      res.json({ status: 200, data });
    } catch (err) {
      res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
    }
  });

  // 3. POST /clv
  router.post('/clv', ...auth, ...validateClv(), async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;
    try {
      const params = {
        topN: req.body.topN ? Number(req.body.topN) : undefined,
        dateRange: req.body.dateFrom && req.body.dateTo
          ? { dateFrom: req.body.dateFrom, dateTo: req.body.dateTo }
          : undefined,
      };
      const key = buildCacheKey('clv', params);
      const data = await withCache(redis, key, cacheTtl, () =>
        getClv(deps.PaymentModel, deps.UserModel, params),
      );
      res.json({ status: 200, data });
    } catch (err) {
      res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
    }
  });

  // 4. GET /staff-benchmark
  router.get('/staff-benchmark', ...auth, ...validateDateRange(), async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;
    try {
      const dateRange: DateRangeParams = { dateFrom: req.query.dateFrom as string, dateTo: req.query.dateTo as string };
      const key = buildCacheKey('staff-benchmark', dateRange);
      const data = await withCache(redis, key, cacheTtl, () =>
        getStaffBenchmark(
          {
            OrderModel: deps.OrderModel,
            LeadActivityModel: deps.LeadActivityModel,
            ReviewAssignmentModel: deps.ReviewAssignmentModel,
            SupportTicketModel: deps.SupportTicketModel,
            UserModel: deps.UserModel,
          },
          dateRange,
        ),
      );
      res.json({ status: 200, data });
    } catch (err) {
      res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
    }
  });

  // 5. POST /channel-roi
  router.post('/channel-roi', ...auth, ...validateChannelRoi(), async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;
    try {
      const dateRange: DateRangeParams = { dateFrom: req.body.dateFrom, dateTo: req.body.dateTo };
      const channels = req.body.channels as string[] | undefined;
      const key = buildCacheKey('channel-roi', { ...dateRange, channels });
      const data = await withCache(redis, key, cacheTtl, () =>
        getChannelRoi(
          {
            CampaignModel: deps.CampaignModel,
            LeadModel: deps.LeadModel,
            OrderModel: deps.OrderModel,
            PaymentModel: deps.PaymentModel,
          },
          dateRange,
          channels,
        ),
      );
      res.json({ status: 200, data });
    } catch (err) {
      res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
    }
  });

  // 6. GET /seasonal-trends
  router.get('/seasonal-trends', ...auth, ...validateDateRange(), ...validateGranularity(), async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;
    try {
      const dateRange: DateRangeParams = { dateFrom: req.query.dateFrom as string, dateTo: req.query.dateTo as string };
      const granularity = (req.query.granularity as 'week' | 'month') ?? 'month';
      const key = buildCacheKey('seasonal-trends', { ...dateRange, granularity });
      const data = await withCache(redis, key, cacheTtl, () =>
        getSeasonalTrends(deps.OrderModel, dateRange, granularity),
      );
      res.json({ status: 200, data });
    } catch (err) {
      res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
    }
  });

  // 7. GET /churn-risk
  router.get('/churn-risk', ...auth, ...validateFinancialYear(), async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;
    try {
      const financialYear = req.query.financialYear as string;
      const key = buildCacheKey('churn-risk', { financialYear });
      const data = await withCache(redis, key, cacheTtl, () =>
        getChurnRisk(deps.TaxYearSummaryModel, deps.UserModel, financialYear),
      );
      res.json({ status: 200, data });
    } catch (err) {
      res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
    }
  });

  // 8. GET /service-mix
  router.get('/service-mix', ...auth, ...validateDateRange(), async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;
    try {
      const dateRange: DateRangeParams = { dateFrom: req.query.dateFrom as string, dateTo: req.query.dateTo as string };
      const key = buildCacheKey('service-mix', dateRange);
      const data = await withCache(redis, key, cacheTtl, () =>
        getServiceMix(deps.OrderModel, deps.PaymentModel, dateRange),
      );
      res.json({ status: 200, data });
    } catch (err) {
      res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
    }
  });

  // 9. GET /collection-rate
  router.get('/collection-rate', ...auth, ...validateDateRange(), async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;
    try {
      const dateRange: DateRangeParams = { dateFrom: req.query.dateFrom as string, dateTo: req.query.dateTo as string };
      const key = buildCacheKey('collection-rate', dateRange);
      const data = await withCache(redis, key, cacheTtl, () =>
        getCollectionRate(deps.PaymentModel, deps.OrderModel, dateRange),
      );
      res.json({ status: 200, data });
    } catch (err) {
      res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
    }
  });

  // 10. GET /pipeline-health
  router.get('/pipeline-health', ...auth, ...validateDateRange(), async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;
    try {
      const dateRange: DateRangeParams = { dateFrom: req.query.dateFrom as string, dateTo: req.query.dateTo as string };
      const key = buildCacheKey('pipeline-health', dateRange);
      const data = await withCache(redis, key, cacheTtl, () =>
        getPipelineHealth(deps.LeadModel, deps.LeadActivityModel, dateRange),
      );
      res.json({ status: 200, data });
    } catch (err) {
      res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
    }
  });

  // 11. POST /export — requires additional 'export' permission
  router.post(
    '/export',
    ...auth,
    deps.checkPermission('analytics_dashboard', 'export'),
    ...validateExport(),
    async (req: Request, res: Response) => {
      if (handleValidationErrors(req, res)) return;
      try {
        if (!deps.exportQueue) {
          res.status(501).json({ status: 501, code: 'EXPORT_NOT_CONFIGURED', message: 'Export queue is not configured' });
          return;
        }
        const data = await createExportJob(deps.exportQueue, {
          format: req.body.format,
          widgets: req.body.widgets,
          dateRange: { dateFrom: req.body.dateFrom, dateTo: req.body.dateTo },
          requestedBy: (req as unknown as { user?: { _id?: string } }).user?._id ?? 'unknown',
        });
        res.status(202).json({ status: 202, data });
      } catch (err) {
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
      }
    },
  );

  // Revenue by period (used internally by executive summary, also exposed)
  router.get('/revenue', ...auth, ...validateDateRange(), async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;
    try {
      const dateRange: DateRangeParams = { dateFrom: req.query.dateFrom as string, dateTo: req.query.dateTo as string };
      const groupBy = (req.query.groupBy as 'day' | 'week' | 'month') ?? 'month';
      const key = buildCacheKey('revenue', { ...dateRange, groupBy });
      const data = await withCache(redis, key, cacheTtl, () =>
        getRevenueByPeriod(deps.PaymentModel, dateRange, groupBy),
      );
      res.json({ status: 200, data });
    } catch (err) {
      res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
    }
  });

  return router;
}
