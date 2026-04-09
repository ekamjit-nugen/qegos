/**
 * Revenue Service — Payment-based revenue aggregation (ANA-INV-02)
 *
 * Revenue is computed ONLY from payments with status in REVENUE_PAYMENT_STATUSES.
 */

import type { Model, Document } from 'mongoose';
import type { DateRangeParams, Granularity, RevenueBucket, CollectionRateResponse } from '../types';
import { REVENUE_PAYMENT_STATUSES } from '../constants';

/**
 * Aggregate revenue by time period (day/week/month).
 */
export async function getRevenueByPeriod(
  PaymentModel: Model<Document>,
  dateRange: DateRangeParams,
  groupBy: Granularity = 'month',
): Promise<RevenueBucket[]> {
  const dateFormat = groupBy === 'week' ? '%Y-W%V' : '%Y-%m';

  const result = await PaymentModel.aggregate([
    {
      $match: {
        status: { $in: [...REVENUE_PAYMENT_STATUSES] },
        createdAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
        totalCents: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        period: '$_id',
        totalCents: 1,
        count: 1,
      },
    },
  ]);

  return result as RevenueBucket[];
}

/**
 * Collection rate: on-time payments, avg days to payment, outstanding receivables.
 */
export async function getCollectionRate(
  PaymentModel: Model<Document>,
  OrderModel: Model<Document>,
  dateRange: DateRangeParams,
): Promise<CollectionRateResponse> {
  // Total invoiced (orders created in range that aren't cancelled)
  const invoiced = await OrderModel.aggregate([
    {
      $match: {
        createdAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo },
        status: { $ne: 9 }, // not cancelled
        isDeleted: { $ne: true },
      },
    },
    { $project: { finalAmount: 1 } }, // Only need finalAmount for sum
    {
      $group: {
        _id: null,
        totalInvoicedCents: { $sum: '$finalAmount' },
      },
    },
  ]);

  // Total collected (succeeded/captured payments in range)
  const collected = await PaymentModel.aggregate([
    {
      $match: {
        status: { $in: [...REVENUE_PAYMENT_STATUSES] },
        createdAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo },
      },
    },
    {
      $group: {
        _id: null,
        totalCollectedCents: { $sum: '$amount' },
        avgDays: {
          $avg: {
            $divide: [
              { $subtract: ['$updatedAt', '$createdAt'] },
              1000 * 60 * 60 * 24, // ms to days
            ],
          },
        },
        count: { $sum: 1 },
      },
    },
  ]);

  // Total pending (pending/authorised/requires_capture payments)
  const pending = await PaymentModel.aggregate([
    {
      $match: {
        status: { $in: ['pending', 'authorised', 'requires_capture'] },
        createdAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo },
      },
    },
    {
      $group: {
        _id: null,
        outstandingCents: { $sum: '$amount' },
      },
    },
  ]);

  const totalInvoicedCents = invoiced[0]?.totalInvoicedCents ?? 0;
  const totalCollectedCents = collected[0]?.totalCollectedCents ?? 0;
  const avgDaysToPayment = Math.round(collected[0]?.avgDays ?? 0);
  const outstandingReceivablesCents = pending[0]?.outstandingCents ?? 0;

  const onTimeRate = totalInvoicedCents > 0
    ? totalCollectedCents / totalInvoicedCents
    : 0;

  return {
    onTimeRate: Math.min(onTimeRate, 1),
    avgDaysToPayment,
    outstandingReceivablesCents,
    totalInvoicedCents,
    totalCollectedCents,
  };
}
