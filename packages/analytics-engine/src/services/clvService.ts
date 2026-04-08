import type { Model, Document } from 'mongoose';
import type { ClvEntry } from '../types';
import { REVENUE_PAYMENT_STATUSES } from '../constants';

/**
 * ANA-INV-03: Client Lifetime Value using only succeeded/captured payments.
 */
export async function getClv(
  PaymentModel: Model<Document>,
  UserModel: Model<Document>,
  params: {
    topN?: number;
    dateRange?: { dateFrom: string; dateTo: string };
  },
): Promise<ClvEntry[]> {
  const matchStage: Record<string, unknown> = {
    status: { $in: [...REVENUE_PAYMENT_STATUSES] },
  };

  if (params.dateRange) {
    matchStage.createdAt = {
      $gte: new Date(params.dateRange.dateFrom),
      $lte: new Date(params.dateRange.dateTo),
    };
  }

  const pipeline: unknown[] = [
    { $match: matchStage },
    {
      $group: {
        _id: '$userId',
        totalPaid: { $sum: '$amount' },
        ordersCount: { $addToSet: '$orderId' },
        lastPaymentDate: { $max: '$createdAt' },
      },
    },
    {
      $addFields: {
        ordersCount: { $size: '$ordersCount' },
      },
    },
    { $sort: { totalPaid: -1 } },
  ];

  if (params.topN) {
    pipeline.push({ $limit: params.topN });
  }

  // Lookup user details
  pipeline.push(
    {
      $lookup: {
        from: UserModel.collection.name,
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        userId: '$_id',
        name: { $concat: [{ $ifNull: ['$user.firstName', ''] }, ' ', { $ifNull: ['$user.lastName', ''] }] },
        email: '$user.email',
        clvScore: '$totalPaid',
        totalPaid: 1,
        ordersCount: 1,
        averageOrderValue: {
          $cond: [
            { $gt: ['$ordersCount', 0] },
            { $round: [{ $divide: ['$totalPaid', '$ordersCount'] }, 0] },
            0,
          ],
        },
        lastOrderDate: {
          $dateToString: { format: '%Y-%m-%d', date: '$lastPaymentDate' },
        },
      },
    },
  );

  const results = await PaymentModel.aggregate(pipeline);

  return results.map((r) => ({
    userId: String(r.userId),
    name: (r.name ?? '').trim(),
    email: r.email ?? '',
    clvScore: r.clvScore ?? r.totalPaid,
    totalPaid: r.totalPaid,
    ordersCount: r.ordersCount,
    averageOrderValue: r.averageOrderValue,
    lastOrderDate: r.lastOrderDate,
  }));
}
