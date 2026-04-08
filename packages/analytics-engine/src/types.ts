import type { Document, Model } from 'mongoose';
import type { RequestHandler } from 'express';

// ─── Config ─────────────────────────────────────────────────────────────────

export interface AnalyticsEngineConfig {
  /** MongoDB read-replica URI. Falls back to primary if not set. */
  analyticsReplicaUri?: string;

  /** ANA-INV-04: Year 1 conversion rate benchmark (default 0.62) */
  year1ConversionRate?: number;

  /** ANA-INV-04: Average order value in cents (default 85000 = $850) */
  averageOrderValueCents?: number;

  /** ANA-INV-04: Months before switching from benchmarks to historical (default 12) */
  benchmarkMonthsThreshold?: number;

  /** ANA-INV-06: Cache TTL in seconds (default 300) */
  cacheTtlSeconds?: number;

  /** Export file expiry in hours (default 48) */
  exportExpiryHours?: number;
}

// ─── Route Dependencies ─────────────────────────────────────────────────────

export interface AnalyticsRouteDeps {
  // Existing models (all read-only)
  OrderModel: Model<Document>;
  PaymentModel: Model<Document>;
  LeadModel: Model<Document>;
  LeadActivityModel: Model<Document>;
  CampaignModel: Model<Document>;
  ReviewAssignmentModel: Model<Document>;
  SupportTicketModel: Model<Document>;
  TaxYearSummaryModel: Model<Document>;
  UserModel: Model<Document>;

  // Infrastructure
  redisClient: unknown; // ioredis instance
  authenticate: () => RequestHandler;
  checkPermission: (resource: string, action: string) => RequestHandler;
  auditLog?: {
    log: (entry: Record<string, unknown>) => Promise<void>;
    logFromRequest?: (req: unknown, entry: Record<string, unknown>) => Promise<void>;
  };
  config: AnalyticsEngineConfig;

  // Optional export queue (BullMQ)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exportQueue?: any;
}

// ─── View Type ──────────────────────────────────────────────────────────────

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

// ─── Date Range ─────────────────────────────────────────────────────────────

export interface DateRangeParams {
  dateFrom: string;
  dateTo: string;
}

// ─── Response Types ─────────────────────────────────────────────────────────

export interface RevenueByPeriod {
  period: string;
  revenue: number; // cents
  count: number;
}

export interface ExecutiveSummaryResponse {
  generatedAt: string;
  dateRange: DateRangeParams;
  financialYear: string;
  revenue: RevenueByPeriod[];
  collectionRate: CollectionRateResponse;
  pipelineHealth: PipelineStageEntry[];
  churnRisk: { atRiskClients: ChurnRiskEntry[]; riskCount: number };
  seasonalTrends: { trends: SeasonalTrendEntry[]; peakPeriod: string | null; peakCount: number };
  serviceMix: ServiceMixEntry[];
  topClients: ClvEntry[];
  staffBenchmark: StaffBenchmarkEntry[];
  channelRoi: ChannelRoiEntry[];
  revenueForecast: RevenueForecastResponse;
}

export interface RevenueForecastEntry {
  quarter: string;
  forecast: number;
  isEstimated: boolean;
  confidenceLow?: number;
  confidenceHigh?: number;
}

export interface RevenueForecastResponse {
  isEstimated: boolean;
  dataMonths: number;
  benchmarkNote: string | null;
  totalRevenue: number;
  totalTransactions: number;
  averageMonthlyRevenue: number;
  trendSlope?: number;
  rSquared?: number;
  quarters: RevenueForecastEntry[];
}

export interface ClvEntry {
  userId: string;
  name: string;
  email: string;
  clvScore: number;
  totalPaid: number;
  ordersCount: number;
  averageOrderValue: number;
  lastOrderDate?: string;
}

export interface StaffBenchmarkEntry {
  staffId: string;
  name: string;
  email: string;
  ordersCompleted: number;
  ordersTotal: number;
  totalRevenue: number;
  avgCompletionDays: number | null;
  leadActivities: number;
  leadsContacted: number;
  reviewsCompleted: number;
  reviewsTotal: number;
  avgReviewTimeDays: number | null;
  ticketsResolved: number;
  ticketsTotal: number;
  avgResolutionHours: number | null;
}

export interface ChannelRoiEntry {
  channel: string;
  campaignCount: number;
  totalSpend: number;
  totalLeads: number;
  totalConverted: number;
  conversionRate: number;
  totalRevenue: number;
  roi: number | null;
  costPerLead: number | null;
  costPerConversion: number | null;
}

export interface SeasonalTrendEntry {
  period: string;
  filings: number;
  yoyChange: number | null;
  yoyCompare: number | null;
}

export interface ChurnRiskEntry {
  userId: string;
  name: string;
  email: string;
  lastFilingFY: string;
  lastFilingDate: string;
  daysSinceLastFiling: number;
  riskScore: number;
}

export interface ServiceMixEntry {
  serviceTitle: string;
  quantity: number;
  revenue: number;
  percentOfTotal: number;
  averagePrice: number;
}

export interface CollectionRateResponse {
  invoicesTotal: number;
  invoicesPaidOnTime: number;
  onTimePaymentRate: number;
  averageDaysToPayment: number;
  outstandingReceivables: number;
  outstandingCount: number;
  collectionRate: number;
}

export interface PipelineStageEntry {
  status: number;
  statusName: string;
  count: number;
  totalValue: number;
  averageValue: number;
  conversionRate: number | null;
  avgAgeDays: number;
  bottleneck: boolean;
}

export interface ExportJobResponse {
  jobId: string;
  status: string;
  message?: string;
}
