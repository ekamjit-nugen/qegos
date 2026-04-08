import type { Model, Document } from 'mongoose';
import type { DateRangeParams, ServiceMixEntry } from '../types';
import { REVENUE_PAYMENT_STATUSES } from '../constants';

/**
 * Service mix: revenue breakdown by service type from order line items.
 */
export async function getServiceMix(
  OrderModel: Model<Document>,
  PaymentModel: Model<Document>,
  dateRange: DateRangeParams,
): Promise<ServiceMixEntry[]> {
  // Get total revenue for percentage calculation
  const totalRevenueResult = await PaymentModel.aggregate([
    {
      $match: {
        status: { $in: [...REVENUE_PAYMENT_STATUSES] },
        createdAt: {
          $gte: new Date(dateRange.dateFrom),
          $lte: new Date(dateRange.dateTo),
        },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  const totalRevenue = totalRevenueResult[0]?.total ?? 0;

  // Aggregate line items from completed orders
  const serviceMix = await OrderModel.aggregate([
    {
      $match: {
        createdAt: {
          $gte: new Date(dateRange.dateFrom),
          $lte: new Date(dateRange.dateTo),
        },
        status: { $in: [6, 7, 8] }, // Completed, Lodged, Assessed
        isDeleted: { $ne: true },
      },
    },
    { $unwind: '$lineItems' },
    {
      $group: {
        _id: '$lineItems.title',
        quantity: { $sum: { $ifNull: ['$lineItems.quantity', 1] } },
        revenue: { $sum: '$lineItems.priceAtCreation' },
      },
    },
    { $sort: { revenue: -1 } },
    {
      $project: {
        _id: 0,
        serviceTitle: '$_id',
        quantity: 1,
        revenue: 1,
        averagePrice: {
          $cond: [
            { $gt: ['$quantity', 0] },
            { $round: [{ $divide: ['$revenue', '$quantity'] }, 0] },
            0,
          ],
        },
      },
    },
  ]);

  return serviceMix.map((s) => ({
    serviceTitle: s.serviceTitle,
    quantity: s.quantity,
    revenue: s.revenue,
    percentOfTotal: totalRevenue > 0
      ? Math.round((s.revenue / totalRevenue) * 100) / 100
      : 0,
    averagePrice: s.averagePrice,
  }));
}
