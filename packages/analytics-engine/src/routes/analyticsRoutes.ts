/**
 * Analytics Routes — 11 endpoints
 *
 * All routes require authenticate() + checkPermission('analytics_dashboard', 'read').
 * Export additionally requires checkPermission('analytics_dashboard', 'export').
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import type { AnalyticsRouteDeps, Granularity } from '../types';
import { DEFAULT_CACHE_TTL } from '../constants';
import { buildCacheKey, withCache } from '../services/cacheService';
import { getCollectionRate } from '../services/revenueService';
import { getRevenueForecast } from '../services/forecastService';
import { getClv } from '../services/clvService';
import { getStaffBenchmark } from '../services/staffBenchmarkService';
import { getChannelRoi } from '../services/channelRoiService';
import { getSeasonalTrends } from '../services/seasonalTrendsService';
import { getChurnRisk } from '../services/churnRiskService';
import { getServiceMix } from '../services/serviceMixService';
import { getPipelineHealth } from '../services/pipelineHealthService';
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

/** Validation error handler helper */
function handleValidation(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      errors: errors.array(),
    });
    return;
  }
  next();
}

/**
 * Create analytics router with all 11 endpoints.
 */
export function createAnalyticsRoutes(deps: AnalyticsRouteDeps): Router {
  const router = Router();
  const auth = deps.authenticate();
  const readPerm = deps.checkPermission('analytics', 'read');
  const cacheTtl = deps.config.cacheTtlSeconds ?? DEFAULT_CACHE_TTL;

  // Helper to parse date range from query
  const parseDateRange = (req: Request): { dateFrom: Date; dateTo: Date } => ({
    dateFrom: new Date(req.query.dateFrom as string),
    dateTo: new Date(req.query.dateTo as string),
  });

  // ── 1. Executive Summary (pre-computed, read from Redis) ──────────────
  router.get(
    '/executive-summary',
    auth, readPerm,
    ...validateDateRange(),
    handleValidation,
    async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const summary = await getExecutiveSummary(deps.redisClient);
        if (!summary) {
          res.status(202).json({
            status: 202,
            message: 'Executive summary is being computed. Try again shortly.',
          });
          return;
        }
        res.status(200).json({ status: 200, data: summary });
      } catch (err) { next(err); }
    },
  );

  // ── 2. Revenue Forecast ───────────────────────────────────────────────
  router.get(
    '/revenue-forecast',
    auth, readPerm,
    ...validateDateRange(),
    handleValidation,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const dateRange = parseDateRange(req);
        const key = buildCacheKey('revenue-forecast', req.query as Record<string, unknown>);
        const data = await withCache(deps.redisClient, key, cacheTtl, () =>
          getRevenueForecast(deps.PaymentModel, deps.config, dateRange),
        );
        res.status(200).json({ status: 200, data });
      } catch (err) { next(err); }
    },
  );

  // ── 3. CLV (POST) ────────────────────────────────────────────────────
  router.post(
    '/clv',
    auth, readPerm,
    ...validateClv(),
    handleValidation,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { topN, segment, dateFrom, dateTo } = req.body as {
          topN?: number; segment?: string; dateFrom?: string; dateTo?: string;
        };
        const params = {
          topN,
          segment,
          dateRange: dateFrom && dateTo
            ? { dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) }
            : undefined,
        };
        const key = buildCacheKey('clv', req.body as Record<string, unknown>);
        const data = await withCache(deps.redisClient, key, cacheTtl, () =>
          getClv(deps.PaymentModel, deps.UserModel, params),
        );
        res.status(200).json({ status: 200, data });
      } catch (err) { next(err); }
    },
  );

  // ── 4. Staff Benchmark ────────────────────────────────────────────────
  router.get(
    '/staff-benchmark',
    auth, readPerm,
    ...validateDateRange(),
    handleValidation,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const dateRange = parseDateRange(req);
        const key = buildCacheKey('staff-benchmark', req.query as Record<string, unknown>);
        const data = await withCache(deps.redisClient, key, cacheTtl, () =>
          getStaffBenchmark({
            OrderModel: deps.OrderModel,
            LeadActivityModel: deps.LeadActivityModel,
            ReviewAssignmentModel: deps.ReviewAssignmentModel,
            SupportTicketModel: deps.SupportTicketModel,
            UserModel: deps.UserModel,
          }, dateRange),
        );
        res.status(200).json({ status: 200, data });
      } catch (err) { next(err); }
    },
  );

  // ── 5. Channel ROI (POST) ─────────────────────────────────────────────
  router.post(
    '/channel-roi',
    auth, readPerm,
    ...validateChannelRoi(),
    handleValidation,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { dateFrom, dateTo, channels } = req.body as {
          dateFrom: string; dateTo: string; channels?: string[];
        };
        const dateRange = { dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) };
        const key = buildCacheKey('channel-roi', req.body as Record<string, unknown>);
        const data = await withCache(deps.redisClient, key, cacheTtl, () =>
          getChannelRoi({
            CampaignModel: deps.CampaignModel,
            LeadModel: deps.LeadModel,
            PaymentModel: deps.PaymentModel,
          }, dateRange, channels),
        );
        res.status(200).json({ status: 200, data });
      } catch (err) { next(err); }
    },
  );

  // ── 6. Seasonal Trends ────────────────────────────────────────────────
  router.get(
    '/seasonal-trends',
    auth, readPerm,
    ...validateDateRange(),
    ...validateGranularity(),
    handleValidation,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const dateRange = parseDateRange(req);
        const granularity = (req.query.granularity as Granularity) ?? 'month';
        const key = buildCacheKey('seasonal-trends', req.query as Record<string, unknown>);
        const data = await withCache(deps.redisClient, key, cacheTtl, () =>
          getSeasonalTrends(deps.OrderModel, deps.PaymentModel, dateRange, granularity),
        );
        res.status(200).json({ status: 200, data });
      } catch (err) { next(err); }
    },
  );

  // ── 7. Churn Risk ─────────────────────────────────────────────────────
  router.get(
    '/churn-risk',
    auth, readPerm,
    ...validateFinancialYear(),
    handleValidation,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const fy = req.query.financialYear as string;
        const key = buildCacheKey('churn-risk', { financialYear: fy });
        const data = await withCache(deps.redisClient, key, cacheTtl, () =>
          getChurnRisk(deps.TaxYearSummaryModel, deps.UserModel, fy),
        );
        res.status(200).json({ status: 200, data });
      } catch (err) { next(err); }
    },
  );

  // ── 8. Service Mix ────────────────────────────────────────────────────
  router.get(
    '/service-mix',
    auth, readPerm,
    ...validateDateRange(),
    handleValidation,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const dateRange = parseDateRange(req);
        const key = buildCacheKey('service-mix', req.query as Record<string, unknown>);
        const data = await withCache(deps.redisClient, key, cacheTtl, () =>
          getServiceMix(deps.OrderModel, dateRange),
        );
        res.status(200).json({ status: 200, data });
      } catch (err) { next(err); }
    },
  );

  // ── 9. Collection Rate ────────────────────────────────────────────────
  router.get(
    '/collection-rate',
    auth, readPerm,
    ...validateDateRange(),
    handleValidation,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const dateRange = parseDateRange(req);
        const key = buildCacheKey('collection-rate', req.query as Record<string, unknown>);
        const data = await withCache(deps.redisClient, key, cacheTtl, () =>
          getCollectionRate(deps.PaymentModel, deps.OrderModel, dateRange),
        );
        res.status(200).json({ status: 200, data });
      } catch (err) { next(err); }
    },
  );

  // ── 10. Pipeline Health ───────────────────────────────────────────────
  router.get(
    '/pipeline-health',
    auth, readPerm,
    ...validateDateRange(),
    handleValidation,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const dateRange = parseDateRange(req);
        const key = buildCacheKey('pipeline-health', req.query as Record<string, unknown>);
        const data = await withCache(deps.redisClient, key, cacheTtl, () =>
          getPipelineHealth(deps.LeadModel, deps.LeadActivityModel, dateRange),
        );
        res.status(200).json({ status: 200, data });
      } catch (err) { next(err); }
    },
  );

  // ── 11. Export (POST, async) ──────────────────────────────────────────
  router.post(
    '/export',
    auth, readPerm,
    deps.checkPermission('analytics', 'export'),
    ...validateExport(),
    handleValidation,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!deps.exportQueue) {
          res.status(501).json({
            status: 501,
            code: 'EXPORT_UNAVAILABLE',
            message: 'Export queue not configured',
          });
          return;
        }

        const { format, widgets, dateFrom, dateTo } = req.body as {
          format: 'pdf' | 'xlsx';
          widgets: string[];
          dateFrom?: string;
          dateTo?: string;
        };

        const userId = (req as unknown as Record<string, unknown>).userId as string;
        const job = await createExportJob(deps.exportQueue, {
          format,
          widgets: widgets as import('../types').AnalyticsView[],
          dateFrom,
          dateTo,
          requestedBy: userId,
        });

        res.status(202).json({ status: 202, data: job });
      } catch (err) { next(err); }
    },
  );

  return router;
}
