/**
 * Executive Summary Service (ANA-INV-07)
 *
 * Pre-computed by BullMQ worker every 5 minutes.
 * getExecutiveSummary reads from Redis; computeExecutiveSummary generates it.
 */

import type { Redis } from 'ioredis';
import type { AnalyticsRouteDeps, ExecutiveSummaryResponse } from '../types';
import { getCached, setCache } from './cacheService';
import { getRevenueByPeriod, getCollectionRate } from './revenueService';
import { getRevenueForecast } from './forecastService';
import { getPipelineHealth } from './pipelineHealthService';
import { getChurnRisk } from './churnRiskService';

const EXECUTIVE_SUMMARY_KEY = 'analytics:executive-summary';
const EXECUTIVE_SUMMARY_TTL = 600; // 10 min (computed every 5 min, so always fresh)

/**
 * Read pre-computed executive summary from Redis.
 */
export async function getExecutiveSummary(
  redis: Redis,
): Promise<ExecutiveSummaryResponse | null> {
  return getCached<ExecutiveSummaryResponse>(redis, EXECUTIVE_SUMMARY_KEY);
}

/**
 * Compute full executive summary and store in Redis.
 * Called by BullMQ worker on schedule.
 */
export async function computeExecutiveSummary(
  deps: AnalyticsRouteDeps,
): Promise<ExecutiveSummaryResponse> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const dateRange = { dateFrom: oneYearAgo, dateTo: now };
  const thisMonth = { dateFrom: thirtyDaysAgo, dateTo: now };
  const lastMonth = { dateFrom: sixtyDaysAgo, dateTo: thirtyDaysAgo };

  // Determine current financial year (AU: July-June)
  const fyStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const currentFY = `${fyStartYear}-${fyStartYear + 1}`;

  // Run all queries in parallel
  const [
    thisMonthRevenue,
    lastMonthRevenue,
    forecast,
    pipeline,
    collection,
    churnRisk,
    activeOrders,
    completedThisMonth,
  ] = await Promise.all([
    getRevenueByPeriod(deps.PaymentModel, thisMonth, 'month'),
    getRevenueByPeriod(deps.PaymentModel, lastMonth, 'month'),
    getRevenueForecast(deps.PaymentModel, deps.config, dateRange),
    getPipelineHealth(deps.LeadModel, deps.LeadActivityModel, dateRange),
    getCollectionRate(deps.PaymentModel, deps.OrderModel, dateRange),
    getChurnRisk(deps.TaxYearSummaryModel, deps.UserModel, currentFY),

    // Active orders (status 1-5)
    deps.OrderModel.aggregate([
      { $match: { status: { $in: [1, 2, 3, 4, 5] }, isDeleted: { $ne: true } } },
      { $project: { completionPercent: 1 } }, // Only need completionPercent for $avg
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          avgCompletion: { $avg: '$completionPercent' },
        },
      },
    ]),

    // Completed this month (status 6, 7, 8)
    deps.OrderModel.countDocuments({
      status: { $in: [6, 7, 8] },
      updatedAt: { $gte: thirtyDaysAgo },
      isDeleted: { $ne: true },
    }),
  ]);

  const thisMonthTotal = thisMonthRevenue.reduce((s, r) => s + r.totalCents, 0);
  const lastMonthTotal = lastMonthRevenue.reduce((s, r) => s + r.totalCents, 0);
  const mom = lastMonthTotal > 0
    ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 10000) / 100
    : 0;

  // Pipeline conversion = Won(6) / total leads
  const totalLeads = pipeline.reduce((s, p) => s + p.count, 0);
  const wonLeads = pipeline.find((p) => p.stage === 6)?.count ?? 0;
  const conversionRate = totalLeads > 0
    ? Math.round((wonLeads / totalLeads) * 10000) / 100
    : 0;

  // Avg days to convert: sum of avgDaysInStage for stages 1-6
  const avgDaysToConvert = pipeline
    .filter((p) => p.stage <= 6)
    .reduce((s, p) => s + p.avgDaysInStage, 0);

  const summary: ExecutiveSummaryResponse = {
    generatedAt: now.toISOString(),
    revenue: {
      totalCents: thisMonthTotal,
      monthOverMonth: mom,
      forecast: forecast.forecast,
      isEstimated: forecast.isEstimated,
    },
    pipeline: {
      totalLeads,
      conversionRate,
      avgDaysToConvert,
    },
    orders: {
      totalActive: activeOrders[0]?.count ?? 0,
      completedThisMonth: completedThisMonth as number,
      avgCompletionPercent: Math.round(activeOrders[0]?.avgCompletion ?? 0),
    },
    churn: {
      atRiskCount: churnRisk.length,
    },
    collection: {
      onTimeRate: collection.onTimeRate,
      outstandingCents: collection.outstandingReceivablesCents,
    },
  };

  // Store in Redis
  await setCache(deps.redisClient, EXECUTIVE_SUMMARY_KEY, EXECUTIVE_SUMMARY_TTL, summary);

  return summary;
}
