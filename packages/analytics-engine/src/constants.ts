/**
 * @nugen/analytics-engine — Constants
 *
 * Shared constants for analytics queries and configuration.
 */

/**
 * Revenue is computed ONLY from payments with these statuses (ANA-INV-02).
 * No other status contributes to revenue metrics.
 */
export const REVENUE_PAYMENT_STATUSES = ['succeeded', 'captured'] as const;

/**
 * The 10 analytics dashboard widget views (9 data + executive summary).
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

/** Maximum date range window for analytics queries (ANA-INV-05) */
export const MAX_DATE_RANGE_DAYS = 366;

/** Default cache TTL in seconds (5 minutes) */
export const DEFAULT_CACHE_TTL = 300;

/** Default year-1 conversion rate when insufficient historical data */
export const DEFAULT_YEAR1_CONVERSION_RATE = 0.62;

/** Default average order value in cents ($850) */
export const DEFAULT_AVG_ORDER_VALUE_CENTS = 85000;

/** Default minimum months of data before switching from benchmark to regression */
export const DEFAULT_BENCHMARK_MONTHS = 12;

/** Default export file expiry in hours */
export const DEFAULT_EXPORT_EXPIRY_HOURS = 48;

/**
 * Lead status number → human-readable name mapping.
 * Matches LeadStatus enum in lead.model.ts.
 */
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

/**
 * Order status number → human-readable name mapping.
 * Matches OrderStatus enum in order.model.ts.
 */
export const ORDER_STATUS_NAMES: Record<number, string> = {
  1: 'Pending',
  2: 'Documents Received',
  3: 'Assigned',
  4: 'In Progress',
  5: 'Review',
  6: 'Completed',
  7: 'Lodged',
  8: 'Assessed',
  9: 'Cancelled',
};
