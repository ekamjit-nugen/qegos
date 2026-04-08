/**
 * @nugen/analytics-engine — Public API
 *
 * Admin analytics dashboard: 11 endpoints, 9 widgets, caching, export.
 */

import type { AnalyticsEngineConfig } from './types';
import {
  DEFAULT_CACHE_TTL,
  DEFAULT_YEAR1_CONVERSION_RATE,
  DEFAULT_AVG_ORDER_VALUE_CENTS,
  DEFAULT_BENCHMARK_MONTHS,
  DEFAULT_EXPORT_EXPIRY_HOURS,
} from './constants';

// ─── Init ────────────────────────────────────────────────────────────────────

/** Apply config defaults. Returns resolved config. */
export function init(config: AnalyticsEngineConfig = {}): AnalyticsEngineConfig {
  return {
    cacheTtlSeconds: config.cacheTtlSeconds ?? DEFAULT_CACHE_TTL,
    year1ConversionRate: config.year1ConversionRate ?? DEFAULT_YEAR1_CONVERSION_RATE,
    averageOrderValueCents: config.averageOrderValueCents ?? DEFAULT_AVG_ORDER_VALUE_CENTS,
    benchmarkMonthsThreshold: config.benchmarkMonthsThreshold ?? DEFAULT_BENCHMARK_MONTHS,
    exportExpiryHours: config.exportExpiryHours ?? DEFAULT_EXPORT_EXPIRY_HOURS,
    analyticsReplicaUri: config.analyticsReplicaUri,
  };
}

// ─── Re-exports ──────────────────────────────────────────────────────────────

// Types
export type {
  AnalyticsEngineConfig,
  AnalyticsRouteDeps,
  DateRangeParams,
  Granularity,
  AnalyticsView,
  RevenueBucket,
  RevenueForecastResponse,
  ForecastQuarter,
  ClvEntry,
  StaffBenchmarkEntry,
  ChannelRoiEntry,
  SeasonalTrendEntry,
  ChurnRiskEntry,
  ServiceMixEntry,
  CollectionRateResponse,
  PipelineStageEntry,
  ExecutiveSummaryResponse,
  ExportJobResponse,
} from './types';

// Constants
export {
  REVENUE_PAYMENT_STATUSES,
  ANALYTICS_VIEWS,
  MAX_DATE_RANGE_DAYS,
  DEFAULT_CACHE_TTL,
  DEFAULT_YEAR1_CONVERSION_RATE,
  DEFAULT_AVG_ORDER_VALUE_CENTS,
  DEFAULT_BENCHMARK_MONTHS,
  DEFAULT_EXPORT_EXPIRY_HOURS,
  LEAD_STATUS_NAMES,
  ORDER_STATUS_NAMES,
} from './constants';

// Routes
export { createAnalyticsRoutes } from './routes/analyticsRoutes';

// Services (for direct use / BullMQ workers)
export { computeExecutiveSummary, getExecutiveSummary } from './services/executiveSummaryService';
export { getRevenueByPeriod, getCollectionRate } from './services/revenueService';
export { getRevenueForecast } from './services/forecastService';
export { getClv } from './services/clvService';
export { getStaffBenchmark } from './services/staffBenchmarkService';
export { getChannelRoi } from './services/channelRoiService';
export { getSeasonalTrends } from './services/seasonalTrendsService';
export { getChurnRisk } from './services/churnRiskService';
export { getServiceMix } from './services/serviceMixService';
export { getPipelineHealth } from './services/pipelineHealthService';
export { createExportJob } from './services/exportService';
export { buildCacheKey, withCache, getCached, setCache } from './services/cacheService';

// Validators
export {
  validateDateRange,
  validateClv,
  validateChannelRoi,
  validateExport,
  validateFinancialYear,
  validateGranularity,
} from './validators/analyticsValidators';
