/** Analytics dashboard response types — mirrors @nugen/analytics-engine */

export interface RevenueBucket {
  period: string;
  totalCents: number;
  count: number;
}

export interface ForecastQuarter {
  quarter: string;
  predictedCents: number;
  lowerBoundCents: number;
  upperBoundCents: number;
}

export interface RevenueForecastResponse {
  historical: RevenueBucket[];
  forecast: ForecastQuarter[];
  isEstimated: boolean;
  dataMonths: number;
}

export interface ClvEntry {
  userId: string;
  displayName: string;
  totalSpentCents: number;
  paymentCount: number;
  firstPayment: string;
  lastPayment: string;
  segment?: string;
}

export interface StaffBenchmarkEntry {
  staffId: string;
  displayName: string;
  ordersCompleted: number;
  avgReviewMinutes: number;
  leadsContacted: number;
  ticketsResolved: number;
}

export interface ChannelRoiEntry {
  channel: string;
  campaignCount: number;
  leadsGenerated: number;
  conversions: number;
  revenueCents: number;
  costCents: number;
  roi: number;
}

export interface SeasonalTrendEntry {
  period: string;
  orderCount: number;
  revenueCents: number;
  previousYearOrderCount?: number;
  previousYearRevenueCents?: number;
}

export interface ChurnRiskEntry {
  userId: string;
  displayName: string;
  lastFinancialYear: string;
  totalPaidCents: number;
  daysSinceLastOrder: number;
}

export interface ServiceMixEntry {
  serviceTitle: string;
  orderCount: number;
  quantity: number;
  revenueCents: number;
  percentOfTotal: number;
}

export interface CollectionRateResponse {
  onTimeRate: number;
  avgDaysToPayment: number;
  outstandingReceivablesCents: number;
  totalInvoicedCents: number;
  totalCollectedCents: number;
}

export interface PipelineStageEntry {
  stage: number;
  stageName: string;
  count: number;
  totalValueCents: number;
  conversionRate: number;
  avgDaysInStage: number;
  isBottleneck: boolean;
}

export interface ExecutiveSummaryResponse {
  generatedAt: string;
  revenue: {
    totalCents: number;
    monthOverMonth: number;
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
