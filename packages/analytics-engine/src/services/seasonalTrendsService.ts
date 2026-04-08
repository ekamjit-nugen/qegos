/**
 * Seasonal Trends Service — Order volume and revenue grouped by period with YoY comparison
 */

import type { Model, Document } from 'mongoose';
import type { DateRangeParams, Granularity, SeasonalTrendEntry } from '../types';
import { REVENUE_PAYMENT_STATUSES } from '../constants';

/**
 * Get seasonal trends with optional year-over-year comparison.
 */
export async function getSeasonalTrends(
  OrderModel: Model<Document>,
  PaymentModel: Model<Document>,
  dateRange: DateRangeParams,
  granularity: Granularity = 'month',
): Promise<SeasonalTrendEntry[]> {
  const dateFormat = granularity === 'week' ? '%Y-W%V' : '%Y-%m';

  // Current period orders
  const orders = await OrderModel.aggregate([
    {
      $match: {
        createdAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo },
        status: { $ne: 9 },
        isDeleted: { $ne: true },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
        orderCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Current period revenue
  const revenue = await PaymentModel.aggregate([
    {
      $match: {
        status: { $in: [...REVENUE_PAYMENT_STATUSES] },
        createdAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
        revenueCents: { $sum: '$amount' },
      },
    },
  ]);

  // Previous year for comparison
  const prevDateFrom = new Date(dateRange.dateFrom);
  prevDateFrom.setFullYear(prevDateFrom.getFullYear() - 1);
  const prevDateTo = new Date(dateRange.dateTo);
  prevDateTo.setFullYear(prevDateTo.getFullYear() - 1);

  const prevOrders = await OrderModel.aggregate([
    {
      $match: {
        createdAt: { $gte: prevDateFrom, $lte: prevDateTo },
        status: { $ne: 9 },
        isDeleted: { $ne: true },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
        orderCount: { $sum: 1 },
      },
    },
  ]);

  const prevRevenue = await PaymentModel.aggregate([
    {
      $match: {
        status: { $in: [...REVENUE_PAYMENT_STATUSES] },
        createdAt: { $gte: prevDateFrom, $lte: prevDateTo },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
        revenueCents: { $sum: '$amount' },
      },
    },
  ]);

  // Build lookup maps for revenue and previous year
  const revenueMap = new Map(
    revenue.map((r: { _id: string; revenueCents: number }) => [r._id, r.revenueCents]),
  );

  // For previous year, shift the period key forward 1 year for matching
  const prevOrderMap = new Map<string, number>();
  const prevRevenueMap = new Map<string, number>();

  for (const po of prevOrders) {
    const shifted = shiftPeriodForward(po._id as string, granularity);
    prevOrderMap.set(shifted, po.orderCount as number);
  }
  for (const pr of prevRevenue) {
    const shifted = shiftPeriodForward(pr._id as string, granularity);
    prevRevenueMap.set(shifted, pr.revenueCents as number);
  }

  return orders.map((o: { _id: string; orderCount: number }) => ({
    period: o._id,
    orderCount: o.orderCount,
    revenueCents: revenueMap.get(o._id) ?? 0,
    previousYearOrderCount: prevOrderMap.get(o._id),
    previousYearRevenueCents: prevRevenueMap.get(o._id),
  }));
}

/** Shift a period string forward by 1 year for YoY matching. */
function shiftPeriodForward(period: string, granularity: Granularity): string {
  if (granularity === 'month') {
    // "2024-07" → "2025-07"
    const [year, month] = period.split('-');
    return `${Number(year) + 1}-${month}`;
  }
  // "2024-W28" → "2025-W28"
  const [year, week] = period.split('-W');
  return `${Number(year) + 1}-W${week}`;
}
