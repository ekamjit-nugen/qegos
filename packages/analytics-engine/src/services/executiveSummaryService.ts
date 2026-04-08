import type { Redis } from 'ioredis';
import type { AnalyticsRouteDeps, ExecutiveSummaryResponse } from '../types';
import { getRevenueByPeriod, getCollectionRate } from './revenueService';
import { getPipelineHealth } from './pipelineHealthService';
import { getChurnRisk } from './churnRiskService';
import { getSeasonalTrends } from './seasonalTrendsService';
import { getServiceMix } from './serviceMixService';
import { getClv } from './clvService';
import { getStaffBenchmark } from './staffBenchmarkService';
import { getChannelRoi } from './channelRoiService';
import { getRevenueForecast } from './forecastService';

const EXECUTIVE_SUMMARY_KEY = 'analytics:executive-summary';

/**
 * ANA-INV-07: Pre-computed executive summary.
 * Called by BullMQ worker every 5 minutes.
 */
export async function computeExecutiveSummary(
  deps: AnalyticsRouteDeps,
): Promise<void> {
  const now = new Date();
  const dateFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split('T')[0];
  const dateTo = now.toISOString().split('T')[0];
  const dateRange = { dateFrom, dateTo };

  // Current financial year (Australian: July–June)
  const fyStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const financialYear = `${fyStartYear}-${String(fyStartYear + 1).slice(2)}`;

  // Run all widget computations in parallel
  const [
    revenue,
    collectionRate,
    pipelineHealth,
    churnRisk,
    seasonalTrends,
    serviceMix,
    clv,
    staffBenchmark,
    channelRoi,
    revenueForecast,
  ] = await Promise.all([
    getRevenueByPeriod(deps.PaymentModel, dateRange, 'month'),
    getCollectionRate(deps.PaymentModel, deps.OrderModel, dateRange),
    getPipelineHealth(deps.LeadModel, deps.LeadActivityModel, dateRange),
    getChurnRisk(deps.TaxYearSummaryModel, deps.UserModel, financialYear),
    getSeasonalTrends(deps.OrderModel, dateRange, 'month'),
    getServiceMix(deps.OrderModel, deps.PaymentModel, dateRange),
    getClv(deps.PaymentModel, deps.UserModel, { topN: 10, dateRange }),
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
    getChannelRoi(
      {
        CampaignModel: deps.CampaignModel,
        LeadModel: deps.LeadModel,
        OrderModel: deps.OrderModel,
        PaymentModel: deps.PaymentModel,
      },
      dateRange,
    ),
    getRevenueForecast(deps.PaymentModel, deps.config, dateRange),
  ]);

  const summary: ExecutiveSummaryResponse = {
    generatedAt: now.toISOString(),
    dateRange,
    financialYear,
    revenue,
    collectionRate,
    pipelineHealth,
    churnRisk,
    seasonalTrends,
    serviceMix,
    topClients: clv,
    staffBenchmark,
    channelRoi,
    revenueForecast,
  };

  await deps.redisClient.set(EXECUTIVE_SUMMARY_KEY, JSON.stringify(summary));
}

/**
 * Read pre-computed executive summary from Redis.
 */
export async function getExecutiveSummary(
  redis: Redis,
): Promise<ExecutiveSummaryResponse | null> {
  const data = await redis.get(EXECUTIVE_SUMMARY_KEY);
  if (!data) return null;
  return JSON.parse(data) as ExecutiveSummaryResponse;
}
