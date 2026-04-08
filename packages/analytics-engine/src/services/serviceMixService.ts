/**
 * Service Mix Service — Revenue breakdown by service line item
 */

import type { Model, Document } from 'mongoose';
import type { DateRangeParams, ServiceMixEntry } from '../types';

/**
 * Unwind order lineItems and group by service title to show revenue mix.
 */
export async function getServiceMix(
  OrderModel: Model<Document>,
  dateRange: DateRangeParams,
): Promise<ServiceMixEntry[]> {
  const result = await OrderModel.aggregate([
    {
      $match: {
        createdAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo },
        status: { $ne: 9 }, // not cancelled
        isDeleted: { $ne: true },
      },
    },
    { $unwind: '$lineItems' },
    {
      $match: {
        'lineItems.completionStatus': { $ne: 'cancelled' },
      },
    },
    {
      $group: {
        _id: '$lineItems.title',
        orderCount: { $addToSet: '$_id' },
        quantity: { $sum: '$lineItems.quantity' },
        revenueCents: {
          $sum: {
            $multiply: ['$lineItems.price', '$lineItems.quantity'],
          },
        },
      },
    },
    { $sort: { revenueCents: -1 } },
    {
      $project: {
        _id: 0,
        serviceTitle: '$_id',
        orderCount: { $size: '$orderCount' },
        quantity: 1,
        revenueCents: 1,
      },
    },
  ]);

  // Calculate total for percentage
  const totalRevenue = result.reduce(
    (sum: number, r: { revenueCents: number }) => sum + r.revenueCents, 0,
  );

  return result.map((r: { serviceTitle: string; orderCount: number; quantity: number; revenueCents: number }) => ({
    ...r,
    percentOfTotal: totalRevenue > 0
      ? Math.round((r.revenueCents / totalRevenue) * 10000) / 100
      : 0,
  }));
}
