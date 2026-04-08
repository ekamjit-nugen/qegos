import type { Model, Document } from 'mongoose';
import type { AnalyticsEngineConfig, RevenueForecastResponse, RevenueForecastEntry } from '../types';
import { REVENUE_PAYMENT_STATUSES, DEFAULT_YEAR1_CONVERSION_RATE, DEFAULT_AVG_ORDER_VALUE_CENTS, DEFAULT_BENCHMARK_MONTHS } from '../constants';

/**
 * ANA-INV-04: Revenue forecast.
 * If < 12 months of data → benchmark mode (isEstimated: true).
 * Else → simple linear regression on monthly revenue.
 */
export async function getRevenueForecast(
  PaymentModel: Model<Document>,
  config: AnalyticsEngineConfig,
  dateRange: { dateFrom: string; dateTo: string },
): Promise<RevenueForecastResponse> {
  const dateFrom = new Date(dateRange.dateFrom);
  const dateTo = new Date(dateRange.dateTo);

  // Get monthly revenue history
  const monthlyRevenue = await PaymentModel.aggregate([
    {
      $match: {
        status: { $in: [...REVENUE_PAYMENT_STATUSES] },
        createdAt: { $gte: dateFrom, $lte: dateTo },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        revenue: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  const benchmarkMonths = config.benchmarkMonthsThreshold ?? DEFAULT_BENCHMARK_MONTHS;
  const isEstimated = monthlyRevenue.length < benchmarkMonths;

  const totalRevenue = monthlyRevenue.reduce((sum, m) => sum + m.revenue, 0);
  const totalTransactions = monthlyRevenue.reduce((sum, m) => sum + m.count, 0);

  if (isEstimated) {
    // ANA-INV-04: Benchmark mode
    const conversionRate = config.year1ConversionRate ?? DEFAULT_YEAR1_CONVERSION_RATE;
    const avgOrderValue = config.averageOrderValueCents ?? DEFAULT_AVG_ORDER_VALUE_CENTS;

    // Use available data + benchmarks for forecast
    const avgMonthlyRevenue = monthlyRevenue.length > 0
      ? totalRevenue / monthlyRevenue.length
      : avgOrderValue * conversionRate * 10; // assume 10 leads/month baseline

    const quarters = buildQuarterlyForecast(dateTo, avgMonthlyRevenue, 0, true);

    return {
      isEstimated: true,
      dataMonths: monthlyRevenue.length,
      benchmarkNote: `Forecast based on ${monthlyRevenue.length} month(s) of data with industry benchmarks (conversion: ${conversionRate * 100}%, avg order: $${(avgOrderValue / 100).toFixed(0)})`,
      totalRevenue,
      totalTransactions,
      averageMonthlyRevenue: Math.round(avgMonthlyRevenue),
      quarters,
    };
  }

  // Linear regression on monthly revenue
  const { slope, intercept, rSquared } = linearRegression(monthlyRevenue.map((m, i) => ({ x: i, y: m.revenue })));

  const avgMonthlyRevenue = Math.round(totalRevenue / monthlyRevenue.length);
  const quarters = buildQuarterlyForecast(dateTo, avgMonthlyRevenue, slope, false);

  // Add confidence based on R²
  for (const q of quarters) {
    const spread = Math.round(q.forecast * (1 - rSquared) * 0.5);
    q.confidenceLow = Math.max(0, q.forecast - spread);
    q.confidenceHigh = q.forecast + spread;
  }

  return {
    isEstimated: false,
    dataMonths: monthlyRevenue.length,
    benchmarkNote: null,
    totalRevenue,
    totalTransactions,
    averageMonthlyRevenue: avgMonthlyRevenue,
    trendSlope: Math.round(slope),
    rSquared: Math.round(rSquared * 100) / 100,
    quarters,
  };
}

/**
 * Build 4 quarterly forecasts starting from the end of the data range.
 */
function buildQuarterlyForecast(
  lastDate: Date,
  avgMonthly: number,
  slope: number,
  isEstimated: boolean,
): RevenueForecastEntry[] {
  const quarters: RevenueForecastEntry[] = [];
  const startMonth = lastDate.getMonth() + 1; // 0-indexed → 1-indexed
  const startYear = lastDate.getFullYear();

  for (let q = 0; q < 4; q++) {
    const quarterStart = new Date(startYear, startMonth + q * 3, 1);
    const qYear = quarterStart.getFullYear();
    const qMonth = quarterStart.getMonth(); // 0-indexed
    const quarterNum = Math.floor(qMonth / 3) + 1;
    const label = `Q${quarterNum} ${qYear}`;

    // Project 3 months of revenue for this quarter
    const monthsAhead = (q + 1) * 3;
    const projectedMonthly = avgMonthly + slope * monthsAhead;
    const quarterForecast = Math.round(Math.max(0, projectedMonthly * 3));

    const entry: RevenueForecastEntry = {
      quarter: label,
      forecast: quarterForecast,
      isEstimated,
    };

    if (!isEstimated) {
      // Placeholder — overridden by caller with R² based confidence
      entry.confidenceLow = quarterForecast;
      entry.confidenceHigh = quarterForecast;
    }

    quarters.push(entry);
  }

  return quarters;
}

/**
 * Simple linear regression: y = slope * x + intercept.
 */
function linearRegression(
  points: Array<{ x: number; y: number }>,
): { slope: number; intercept: number; rSquared: number } {
  const n = points.length;
  if (n === 0) return { slope: 0, intercept: 0, rSquared: 0 };
  if (n === 1) return { slope: 0, intercept: points[0].y, rSquared: 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return { slope: 0, intercept: sumY / n, rSquared: 0 };

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // R² calculation
  const meanY = sumY / n;
  let ssRes = 0;
  let ssTot = 0;

  for (const p of points) {
    const predicted = slope * p.x + intercept;
    ssRes += (p.y - predicted) ** 2;
    ssTot += (p.y - meanY) ** 2;
  }

  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, rSquared: Math.max(0, rSquared) };
}
