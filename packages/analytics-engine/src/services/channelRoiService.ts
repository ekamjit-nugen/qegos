/**
 * Channel ROI Service — Multi-hop: Campaign → Lead → Order → Payment
 *
 * Tracks acquisition cost and revenue per marketing channel.
 */

import type { Model } from 'mongoose';
import type { DateRangeParams, ChannelRoiEntry } from '../types';
import { REVENUE_PAYMENT_STATUSES } from '../constants';

export interface ChannelRoiDeps {
  /* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose Model<T> invariance; app passes Model<IFooDocument> */
  CampaignModel: Model<any>;
  LeadModel: Model<any>;
  PaymentModel: Model<any>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * Compute ROI per channel by tracing Campaign → Lead → Order → Payment.
 */
export async function getChannelRoi(
  deps: ChannelRoiDeps,
  dateRange: DateRangeParams,
  channels?: string[],
): Promise<ChannelRoiEntry[]> {
  const { CampaignModel, LeadModel, PaymentModel } = deps;

  // 1. Campaigns grouped by channel
  const campaignMatch: Record<string, unknown> = {
    createdAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo },
  };
  if (channels && channels.length > 0) {
    campaignMatch.channel = { $in: channels };
  }

  const campaigns = await CampaignModel.aggregate([
    { $match: campaignMatch },
    {
      $group: {
        _id: '$channel',
        campaignCount: { $sum: 1 },
        campaignIds: { $push: '$_id' },
        costCents: { $sum: { $ifNull: ['$budgetCents', 0] } },
      },
    },
  ]);

  if (campaigns.length === 0) {
    return [];
  }

  // 2. Leads per campaign → channel
  const allCampaignIds = campaigns.flatMap((c: { campaignIds: unknown[] }) => c.campaignIds);

  const leads = await LeadModel.aggregate([
    {
      $match: {
        campaignId: { $in: allCampaignIds },
        isDeleted: { $ne: true },
      },
    },
    {
      $group: {
        _id: '$campaignId',
        leadsGenerated: { $sum: 1 },
        convertedOrderIds: {
          $push: {
            $cond: [{ $eq: ['$isConverted', true] }, '$convertedOrderId', '$$REMOVE'],
          },
        },
      },
    },
  ]);

  const leadsByCampaign = new Map(
    leads.map((l: { _id: unknown; leadsGenerated: number; convertedOrderIds: unknown[] }) => [
      String(l._id),
      { leadsGenerated: l.leadsGenerated, convertedOrderIds: l.convertedOrderIds },
    ]),
  );

  // 3. Revenue from converted orders' payments
  const allOrderIds = leads
    .flatMap((l: { convertedOrderIds: unknown[] }) => l.convertedOrderIds)
    .filter(Boolean);

  const revenueByOrder = new Map<string, number>();
  if (allOrderIds.length > 0) {
    const payments = await PaymentModel.aggregate([
      {
        $match: {
          orderId: { $in: allOrderIds },
          status: { $in: [...REVENUE_PAYMENT_STATUSES] },
        },
      },
      {
        $group: {
          _id: '$orderId',
          revenueCents: { $sum: '$amount' },
        },
      },
    ]);
    for (const p of payments) {
      revenueByOrder.set(String(p._id), p.revenueCents);
    }
  }

  // 4. Assemble per channel
  return campaigns
    .map(
      (c: {
        _id: string;
        campaignCount: number;
        campaignIds: Array<{ toString: () => string }>;
        costCents: number;
      }) => {
        let leadsGenerated = 0;
        let conversions = 0;
        let revenueCents = 0;

        for (const cid of c.campaignIds) {
          const data = leadsByCampaign.get(String(cid));
          if (!data) {
            continue;
          }
          leadsGenerated += data.leadsGenerated;
          for (const oid of data.convertedOrderIds) {
            if (!oid) {
              continue;
            }
            conversions++;
            revenueCents += revenueByOrder.get(String(oid)) ?? 0;
          }
        }

        const roi =
          c.costCents > 0
            ? Math.round(((revenueCents - c.costCents) / c.costCents) * 100) / 100
            : 0;

        return {
          channel: c._id,
          campaignCount: c.campaignCount,
          leadsGenerated,
          conversions,
          revenueCents,
          costCents: c.costCents,
          roi,
        };
      },
    )
    .sort((a: ChannelRoiEntry, b: ChannelRoiEntry) => b.revenueCents - a.revenueCents);
}
