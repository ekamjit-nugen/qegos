/**
 * ANA-INV-02 / ANA-INV-03: Only these Payment statuses count as revenue.
 * Never use Order.finalAmount for revenue calculations.
 */
export const REVENUE_PAYMENT_STATUSES = ['succeeded', 'captured'] as const;

/**
 * Dashboard widget view names.
 */
export const ANALYTICS_VIEWS = [
  'executive-summary',
  'revenue-forecast',
  'clv',
  'staff-benchmark',
  'channel-roi',
  'seasonal-trends',
  'churn-risk',
  'service-mix',
  'collection-rate',
  'pipeline-health',
] as const;

/** ANA-INV-05: Maximum date range window in days */
export const MAX_DATE_RANGE_DAYS = 366;

/** ANA-INV-06: Default cache TTL in seconds (5 minutes) */
export const DEFAULT_CACHE_TTL = 300;

/** ANA-INV-04: Default year 1 conversion rate benchmark */
export const DEFAULT_YEAR1_CONVERSION_RATE = 0.62;

/** ANA-INV-04: Default average order value in cents ($850) */
export const DEFAULT_AVG_ORDER_VALUE_CENTS = 85000;

/** ANA-INV-04: Months of data before switching from benchmarks to historical */
export const DEFAULT_BENCHMARK_MONTHS = 12;

/** Default export file expiry in hours */
export const DEFAULT_EXPORT_EXPIRY_HOURS = 48;

/** Lead status name mapping (1-8) */
export const LEAD_STATUS_NAMES: Record<number, string> = {
  1: 'New',
  2: 'Contacted',
  3: 'Qualified',
  4: 'Quote Sent',
  5: 'Negotiation',
  6: 'Won',
  7: 'Lost',
  8: 'Dormant',
};

/** Export format options */
export const EXPORT_FORMATS = ['pdf', 'xlsx'] as const;
