/**
 * CLV Service — Customer Lifetime Value (ANA-INV-03)
 *
 * Uses ONLY succeeded/captured payments for CLV calculation.
 */

import type { Model } from 'mongoose';
import type { DateRangeParams, ClvEntry } from '../types';
import { REVENUE_PAYMENT_STATUSES } from '../constants';

export interface ClvParams {
  topN?: number;
  segment?: string;
  dateRange?: DateRangeParams;
}

/**
 * Compute CLV by grouping payments per user, ranking by total spent.
 */
export async function getClv(
  PaymentModel: Model<any>,
  UserModel: Model<any>,
  params: ClvParams = {},
): Promise<ClvEntry[]> {
  const { topN = 50, dateRange } = params;

  const matchStage: Record<string, unknown> = {
    status: { $in: [...REVENUE_PAYMENT_STATUSES] },
  };
  if (dateRange) {
    matchStage.createdAt = { $gte: dateRange.dateFrom, $lte: dateRange.dateTo };
  }

  const clvData = await PaymentModel.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$userId',
        totalSpentCents: { $sum: '$amount' },
        paymentCount: { $sum: 1 },
        firstPayment: { $min: '$createdAt' },
        lastPayment: { $max: '$createdAt' },
      },
    },
    { $sort: { totalSpentCents: -1 } },
    { $limit: topN },
  ]);

  if (clvData.length === 0) return [];

  // Enrich with user display names
  const userIds = clvData.map((c: { _id: unknown }) => c._id);
  const users = await UserModel.find(
    { _id: { $in: userIds } },
    { firstName: 1, lastName: 1 },
  ).lean();

  const userMap = new Map(
    users.map((u: Record<string, unknown>) => [
      String(u._id),
      `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
    ]),
  );

  return clvData.map((c: {
    _id: { toString: () => string };
    totalSpentCents: number;
    paymentCount: number;
    firstPayment: Date;
    lastPayment: Date;
  }) => ({
    userId: c._id.toString(),
    displayName: userMap.get(c._id.toString()) ?? 'Unknown',
    totalSpentCents: c.totalSpentCents,
    paymentCount: c.paymentCount,
    firstPayment: c.firstPayment,
    lastPayment: c.lastPayment,
    segment: params.segment,
  }));
}
