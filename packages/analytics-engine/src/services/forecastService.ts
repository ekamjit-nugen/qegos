/**
 * Forecast Service — Revenue forecasting (ANA-INV-04)
 *
 * < benchmarkMonthsThreshold months of data → benchmark mode (isEstimated: true)
 * >= benchmarkMonthsThreshold months → simple linear regression
 */

import type { Model, Document } from 'mongoose';
import type {
  AnalyticsEngineConfig,
  DateRangeParams,
  RevenueForecastResponse,
  RevenueBucket,
  ForecastQuarter,
} from '../types';
import {
  REVENUE_PAYMENT_STATUSES,
  DEFAULT_YEAR1_CONVERSION_RATE,
  DEFAULT_AVG_ORDER_VALUE_CENTS,
  DEFAULT_BENCHMARK_MONTHS,
} from '../constants';

/**
 * Generate revenue forecast with confidence intervals.
 */
export async function getRevenueForecast(
  PaymentModel: Model<Document>,
  config: AnalyticsEngineConfig,
  dateRange: DateRangeParams,
): Promise<RevenueForecastResponse> {
  const benchmarkMonths = config.benchmarkMonthsThreshold ?? DEFAULT_BENCHMARK_MONTHS;

  // Get monthly revenue history
  const historical = await PaymentModel.aggregate([
    {
      $match: {
        status: { $in: [...REVENUE_PAYMENT_STATUSES] },
        createdAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
        totalCents: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: { _id: 0, period: '$_id', totalCents: 1, count: 1 },
    },
  ]) as RevenueBucket[];

  const dataMonths = historical.length;
  const isEstimated = dataMonths < benchmarkMonths;

  let forecast: ForecastQuarter[];

  if (isEstimated) {
    // Benchmark mode: use configurable conversion rate and average order value
    const conversionRate = config.year1ConversionRate ?? DEFAULT_YEAR1_CONVERSION_RATE;
    const avgOrderCents = config.averageOrderValueCents ?? DEFAULT_AVG_ORDER_VALUE_CENTS;
    const monthlyEstimate = Math.round(avgOrderCents * conversionRate * 30); // rough monthly

    forecast = generateQuarterlyForecast(dateRange.dateTo, monthlyEstimate, 0.25);
  } else {
    // Linear regression on monthly totals
    const values = historical.map((h) => h.totalCents);
    const { slope, intercept } = linearRegression(values);

    const nextMonthIndex = values.length;
    forecast = generateQuarterlyFromRegression(
      dateRange.dateTo,
      slope,
      intercept,
      nextMonthIndex,
    );
  }

  return { historical, forecast, isEstimated, dataMonths };
}

/**
 * Simple linear regression: y = slope * x + intercept
 */
function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return {
    slope: Number.isFinite(slope) ? slope : 0,
    intercept: Number.isFinite(intercept) ? intercept : 0,
  };
}

/**
 * Generate 4 quarterly forecasts from a monthly estimate with confidence band.
 */
function generateQuarterlyForecast(
  fromDate: Date,
  monthlyEstimate: number,
  uncertaintyPct: number,
): ForecastQuarter[] {
  const quarters: ForecastQuarter[] = [];
  const startMonth = fromDate.getMonth();
  const startYear = fromDate.getFullYear();

  for (let q = 0; q < 4; q++) {
    const monthOffset = (q + 1) * 3;
    const qMonth = (startMonth + monthOffset) % 12;
    const qYear = startYear + Math.floor((startMonth + monthOffset) / 12);
    const quarterNum = Math.floor(qMonth / 3) + 1;

    const predicted = monthlyEstimate * 3;
    const uncertainty = predicted * uncertaintyPct * (q + 1);

    quarters.push({
      quarter: `${qYear}-Q${quarterNum}`,
      predictedCents: Math.round(predicted),
      lowerBoundCents: Math.round(predicted - uncertainty),
      upperBoundCents: Math.round(predicted + uncertainty),
    });
  }

  return quarters;
}

/**
 * Generate quarterly forecasts from linear regression.
 */
function generateQuarterlyFromRegression(
  fromDate: Date,
  slope: number,
  intercept: number,
  nextIndex: number,
): ForecastQuarter[] {
  const quarters: ForecastQuarter[] = [];
  const startMonth = fromDate.getMonth();
  const startYear = fromDate.getFullYear();

  for (let q = 0; q < 4; q++) {
    const monthOffset = (q + 1) * 3;
    const qMonth = (startMonth + monthOffset) % 12;
    const qYear = startYear + Math.floor((startMonth + monthOffset) / 12);
    const quarterNum = Math.floor(qMonth / 3) + 1;

    // Sum 3 months of predicted values
    let quarterTotal = 0;
    for (let m = 0; m < 3; m++) {
      const idx = nextIndex + q * 3 + m;
      quarterTotal += slope * idx + intercept;
    }

    const predicted = Math.round(Math.max(0, quarterTotal));
    const confidenceWidth = Math.round(predicted * 0.15 * (q + 1));

    quarters.push({
      quarter: `${qYear}-Q${quarterNum}`,
      predictedCents: predicted,
      lowerBoundCents: Math.max(0, predicted - confidenceWidth),
      upperBoundCents: predicted + confidenceWidth,
    });
  }

  return quarters;
}
