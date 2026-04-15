/**
 * @nugen/analytics-engine — Type Definitions
 *
 * All interfaces and types for the analytics dashboard engine.
 * Product-agnostic: consuming app provides model refs via AnalyticsRouteDeps.
 */

import type { Model } from 'mongoose';
import type { RequestHandler } from 'express';
import type { Redis } from 'ioredis';

// ═══════════════════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════════════════

export interface AnalyticsEngineConfig {
  /** URI for analytics read-replica MongoDB (optional — uses primary if omitted) */
  analyticsReplicaUri?: string;
  /** Assumed year-1 conversion rate when < 12 months data (default 0.62) */
  year1ConversionRate?: number;
  /** Average order value in cents for benchmark estimates (default 85000 = $850) */
  averageOrderValueCents?: number;
  /** Minimum months of data before switching from benchmark to regression (default 12) */
  benchmarkMonthsThreshold?: number;
  /** Default cache TTL in seconds (default 300 = 5 min) */
  cacheTtlSeconds?: number;
  /** Export file expiry in hours (default 48) */
  exportExpiryHours?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Route Dependencies (Dependency Injection)
// ═══════════════════════════════════════════════════════════════════════════════

export interface AnalyticsRouteDeps {
  // Models — consumer provides replica-backed models (ANA-INV-01).
  // Typed as Model<any> because Mongoose's Model<T> is invariant in T;
  // `any` at the DI boundary lets consumers pass Model<ISpecificDoc>
  // without per-call-site `as never` casts. Analytics services only use
  // structural aggregation methods (find, aggregate, countDocuments) and
  // never read typed fields off result documents.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  OrderModel: Model<any>;
  PaymentModel: Model<any>;
  LeadModel: Model<any>;
  LeadActivityModel: Model<any>;
  UserModel: Model<any>;
  ReviewAssignmentModel: Model<any>;
  SupportTicketModel: Model<any>;
  TaxYearSummaryModel: Model<any>;
  CampaignModel: Model<any>;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Infrastructure
  redisClient: Redis;

  // Middleware
  authenticate: () => RequestHandler;
  checkPermission: import('@nugen/rbac').CheckPermissionFn;

  // Audit logging (shape varies per product)
  auditLog: Record<string, unknown>;

  // Config
  config: AnalyticsEngineConfig;

  // BullMQ export queue (optional — export endpoint disabled if omitted)
  exportQueue?: {
    add: (name: string, data: unknown) => Promise<unknown>;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Common Params
// ═══════════════════════════════════════════════════════════════════════════════

export interface DateRangeParams {
  dateFrom: Date;
  dateTo: Date;
}

export type Granularity = 'week' | 'month';

export type AnalyticsView =
  | 'executive-summary'
  | 'revenue-forecast'
  | 'clv'
  | 'staff-benchmark'
  | 'channel-roi'
  | 'seasonal-trends'
  | 'churn-risk'
  | 'service-mix'
  | 'collection-rate'
  | 'pipeline-health';

// ═══════════════════════════════════════════════════════════════════════════════
// Response Interfaces
// ═══════════════════════════════════════════════════════════════════════════════

/** Revenue by period bucket */
export interface RevenueBucket {
  period: string; // ISO date or "YYYY-Www" / "YYYY-MM"
  totalCents: number;
  count: number;
}

/** Revenue forecast (ANA-INV-04) */
export interface RevenueForecastResponse {
  historical: RevenueBucket[];
  forecast: ForecastQuarter[];
  isEstimated: boolean; // true if < benchmarkMonthsThreshold data
  dataMonths: number;
}

export interface ForecastQuarter {
  quarter: string; // e.g. "2026-Q3"
  predictedCents: number;
  lowerBoundCents: number;
  upperBoundCents: number;
}

/** Customer lifetime value */
export interface ClvEntry {
  userId: string;
  displayName: string;
  totalSpentCents: number;
  paymentCount: number;
  firstPayment: Date;
  lastPayment: Date;
  segment?: string;
}

/** Staff benchmark (cross-collection) */
export interface StaffBenchmarkEntry {
  staffId: string;
  displayName: string;
  ordersCompleted: number;
  avgReviewMinutes: number;
  leadsContacted: number;
  ticketsResolved: number;
}

/** Channel ROI (multi-hop) */
export interface ChannelRoiEntry {
  channel: string;
  campaignCount: number;
  leadsGenerated: number;
  conversions: number;
  revenueCents: number;
  costCents: number;
  roi: number; // (revenue - cost) / cost
}

/** Seasonal trends */
export interface SeasonalTrendEntry {
  period: string;
  orderCount: number;
  revenueCents: number;
  previousYearOrderCount?: number;
  previousYearRevenueCents?: number;
}

/** Churn risk */
export interface ChurnRiskEntry {
  userId: string;
  displayName: string;
  lastFinancialYear: string;
  totalPaidCents: number;
  daysSinceLastOrder: number;
}

/** Service mix */
export interface ServiceMixEntry {
  serviceTitle: string;
  orderCount: number;
  quantity: number;
  revenueCents: number;
  percentOfTotal: number;
}

/** Collection rate */
export interface CollectionRateResponse {
  onTimeRate: number; // 0-1
  avgDaysToPayment: number;
  outstandingReceivablesCents: number;
  totalInvoicedCents: number;
  totalCollectedCents: number;
}

/** Pipeline health */
export interface PipelineStageEntry {
  stage: number; // 1-8
  stageName: string;
  count: number;
  totalValueCents: number;
  conversionRate: number; // to next stage
  avgDaysInStage: number;
  isBottleneck: boolean;
}

/** Executive summary (pre-computed, ANA-INV-07) */
export interface ExecutiveSummaryResponse {
  generatedAt: string; // ISO date
  revenue: {
    totalCents: number;
    monthOverMonth: number; // percentage change
    forecast: ForecastQuarter[];
    isEstimated: boolean;
  };
  pipeline: {
    totalLeads: number;
    conversionRate: number;
    avgDaysToConvert: number;
  };
  orders: {
    totalActive: number;
    completedThisMonth: number;
    avgCompletionPercent: number;
  };
  churn: {
    atRiskCount: number;
  };
  collection: {
    onTimeRate: number;
    outstandingCents: number;
  };
}

/** Export job */
export interface ExportJobResponse {
  jobId: string;
  status: 'queued';
  format: 'pdf' | 'xlsx';
  widgets: AnalyticsView[];
}
