import type { Model, Document } from 'mongoose';
import type { DateRangeParams, SeasonalTrendEntry } from '../types';

/**
 * Seasonal trends: filing volume by week or month with YoY comparison.
 */
export async function getSeasonalTrends(
  OrderModel: Model<Document>,
  dateRange: DateRangeParams,
  granularity: 'week' | 'month' = 'month',
): Promise<{ trends: SeasonalTrendEntry[]; peakPeriod: string | null; peakCount: number }> {
  const dateFrom = new Date(dateRange.dateFrom);
  const dateTo = new Date(dateRange.dateTo);

  // Compute previous year range for YoY
  const prevFrom = new Date(dateFrom);
  prevFrom.setFullYear(prevFrom.getFullYear() - 1);
  const prevTo = new Date(dateTo);
  prevTo.setFullYear(prevTo.getFullYear() - 1);

  const periodFormat = granularity === 'week'
    ? { $dateToString: { format: '%V', date: '$createdAt' } } // ISO week number
    : { $dateToString: { format: '%m', date: '$createdAt' } }; // Month number

  const yearExpr = { $year: '$createdAt' };

  // Current period
  const currentStats = await OrderModel.aggregate([
    {
      $match: {
        createdAt: { $gte: dateFrom, $lte: dateTo },
        isDeleted: { $ne: true },
      },
    },
    {
      $group: {
        _id: { period: periodFormat, year: yearExpr },
        filings: { $sum: 1 },
      },
    },
    { $sort: { '_id.period': 1 } },
  ]);

  // Previous year for YoY
  const prevStats = await OrderModel.aggregate([
    {
      $match: {
        createdAt: { $gte: prevFrom, $lte: prevTo },
        isDeleted: { $ne: true },
      },
    },
    {
      $group: {
        _id: { period: periodFormat },
        filings: { $sum: 1 },
      },
    },
  ]);

  // Build YoY lookup
  const prevMap = new Map<string, number>();
  for (const p of prevStats) {
    prevMap.set(p._id.period, p.filings);
  }

  let peakPeriod: string | null = null;
  let peakCount = 0;

  const trends: SeasonalTrendEntry[] = currentStats.map((c) => {
    const periodKey = `${c._id.year}-${granularity === 'week' ? 'W' : 'M'}${c._id.period}`;
    const prevCount = prevMap.get(c._id.period) ?? null;
    const yoyChange = prevCount !== null && prevCount > 0
      ? Math.round(((c.filings - prevCount) / prevCount) * 100) / 100
      : null;

    if (c.filings > peakCount) {
      peakCount = c.filings;
      peakPeriod = periodKey;
    }

    return {
      period: periodKey,
      filings: c.filings,
      yoyChange,
      yoyCompare: prevCount,
    };
  });

  return { trends, peakPeriod, peakCount };
}
