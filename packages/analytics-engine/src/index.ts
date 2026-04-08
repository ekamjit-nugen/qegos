import type { AnalyticsEngineConfig } from './types';

// ─── Types ──────────────────────────────────────────────────────────────────
export type {
  AnalyticsEngineConfig,
  AnalyticsRouteDeps,
  AnalyticsView,
  DateRangeParams,
  RevenueByPeriod,
  ExecutiveSummaryResponse,
  RevenueForecastEntry,
  RevenueForecastResponse,
  ClvEntry,
  StaffBenchmarkEntry,
  ChannelRoiEntry,
  SeasonalTrendEntry,
  ChurnRiskEntry,
  ServiceMixEntry,
  CollectionRateResponse,
  PipelineStageEntry,
  ExportJobResponse,
} from './types';

// ─── Constants ──────────────────────────────────────────────────────────────
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
  EXPORT_FORMATS,
} from './constants';

// ─── Services ───────────────────────────────────────────────────────────────
export { buildCacheKey, getCached, setCache, withCache } from './services/cacheService';
export { getRevenueByPeriod, getCollectionRate } from './services/revenueService';
export { getPipelineHealth } from './services/pipelineHealthService';
export { getChurnRisk } from './services/churnRiskService';
export { getSeasonalTrends } from './services/seasonalTrendsService';
export { getServiceMix } from './services/serviceMixService';
export { getClv } from './services/clvService';
export { getStaffBenchmark } from './services/staffBenchmarkService';
export { getChannelRoi } from './services/channelRoiService';
export { getRevenueForecast } from './services/forecastService';
export { computeExecutiveSummary, getExecutiveSummary } from './services/executiveSummaryService';
export { createExportJob } from './services/exportService';

// ─── Validators ─────────────────────────────────────────────────────────────
export {
  validateDateRange,
  validateClv,
  validateChannelRoi,
  validateExport,
  validateFinancialYear,
  validateGranularity,
} from './validators/analyticsValidators';

// ─── Routes ─────────────────────────────────────────────────────────────────
export { createAnalyticsRoutes } from './routes/analyticsRoutes';

// ─── Init ───────────────────────────────────────────────────────────────────

/**
 * Initialize analytics engine with config defaults.
 * Analytics is stateless — no models created, no connections managed.
 * Returns resolved config for use by route deps.
 */
export function init(config?: Partial<AnalyticsEngineConfig>): AnalyticsEngineConfig {
  return {
    year1ConversionRate: config?.year1ConversionRate ?? 0.62,
    averageOrderValueCents: config?.averageOrderValueCents ?? 85000,
    benchmarkMonthsThreshold: config?.benchmarkMonthsThreshold ?? 12,
    cacheTtlSeconds: config?.cacheTtlSeconds ?? 300,
    exportExpiryHours: config?.exportExpiryHours ?? 48,
    analyticsReplicaUri: config?.analyticsReplicaUri,
  };
}
