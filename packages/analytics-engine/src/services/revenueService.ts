import type { Model, Document } from 'mongoose';
import type { DateRangeParams, RevenueByPeriod, CollectionRateResponse } from '../types';
import { REVENUE_PAYMENT_STATUSES } from '../constants';

/**
 * ANA-INV-02: Revenue aggregation using only Payment collection with succeeded/captured status.
 */
export async function getRevenueByPeriod(
  PaymentModel: Model<Document>,
  dateRange: DateRangeParams,
  groupBy: 'day' | 'week' | 'month' = 'month',
): Promise<RevenueByPeriod[]> {
  const dateGrouping = {
    day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
    week: { $dateToString: { format: '%Y-W%V', date: '$createdAt' } },
    month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
  };

  const results = await PaymentModel.aggregate([
    {
      $match: {
        status: { $in: [...REVENUE_PAYMENT_STATUSES] },
        createdAt: {
          $gte: new Date(dateRange.dateFrom),
          $lte: new Date(dateRange.dateTo),
        },
      },
    },
    {
      $group: {
        _id: dateGrouping[groupBy],
        revenue: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        period: '$_id',
        revenue: 1,
        count: 1,
      },
    },
  ]);

  return results;
}

/**
 * Collection rate: payment timeliness and receivables.
 */
export async function getCollectionRate(
  PaymentModel: Model<Document>,
  OrderModel: Model<Document>,
  dateRange: DateRangeParams,
): Promise<CollectionRateResponse> {
  const dateMatch = {
    createdAt: {
      $gte: new Date(dateRange.dateFrom),
      $lte: new Date(dateRange.dateTo),
    },
  };

  // Total completed orders in range
  const orderStats = await OrderModel.aggregate([
    {
      $match: {
        ...dateMatch,
        status: { $in: [6, 7, 8, 9] }, // Completed, Lodged, Assessed, Cancelled
        isDeleted: { $ne: true },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        totalAmount: { $sum: '$finalAmount' },
      },
    },
  ]);

  // Payment stats
  const paymentStats = await PaymentModel.aggregate([
    {
      $match: {
        ...dateMatch,
        status: { $in: [...REVENUE_PAYMENT_STATUSES] },
      },
    },
    {
      $group: {
        _id: null,
        totalPaid: { $sum: '$amount' },
        count: { $sum: 1 },
        avgDays: { $avg: { $divide: [{ $subtract: ['$updatedAt', '$createdAt'] }, 86400000] } },
      },
    },
  ]);

  // Outstanding (pending/authorized but not yet succeeded)
  const outstandingStats = await PaymentModel.aggregate([
    {
      $match: {
        ...dateMatch,
        status: { $in: ['pending', 'requires_capture', 'authorised'] },
      },
    },
    {
      $group: {
        _id: null,
        outstanding: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  const totalOrders = orderStats[0]?.total ?? 0;
  const paidCount = paymentStats[0]?.count ?? 0;
  const avgDays = paymentStats[0]?.avgDays ?? 0;
  const outstandingAmount = outstandingStats[0]?.outstanding ?? 0;
  const outstandingCount = outstandingStats[0]?.count ?? 0;

  const collectionRate = totalOrders > 0 ? paidCount / totalOrders : 0;
  const onTimeRate = collectionRate; // Simplified — all payments within period are "on time"

  return {
    invoicesTotal: totalOrders,
    invoicesPaidOnTime: paidCount,
    onTimePaymentRate: Math.round(onTimeRate * 100) / 100,
    averageDaysToPayment: Math.round(avgDays * 10) / 10,
    outstandingReceivables: outstandingAmount,
    outstandingCount,
    collectionRate: Math.round(collectionRate * 100) / 100,
  };
}
