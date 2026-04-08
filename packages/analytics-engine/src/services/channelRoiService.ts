import type { Model, Document } from 'mongoose';
import type { DateRangeParams, ChannelRoiEntry } from '../types';
import { REVENUE_PAYMENT_STATUSES } from '../constants';

/**
 * Channel ROI: multi-hop Campaign → Lead → Order → Payment.
 * 3 queries with in-memory join to calculate ROI per marketing channel.
 */
export async function getChannelRoi(
  deps: {
    CampaignModel: Model<Document>;
    LeadModel: Model<Document>;
    OrderModel: Model<Document>;
    PaymentModel: Model<Document>;
  },
  dateRange: DateRangeParams,
  channels?: string[],
): Promise<ChannelRoiEntry[]> {
  const dateFilter = {
    $gte: new Date(dateRange.dateFrom),
    $lte: new Date(dateRange.dateTo),
  };

  // Step 1: Get campaigns with spend data
  const campaignMatch: Record<string, unknown> = {
    createdAt: dateFilter,
  };
  if (channels && channels.length > 0) {
    campaignMatch.channel = { $in: channels };
  }

  const campaigns = await deps.CampaignModel.aggregate([
    { $match: campaignMatch },
    {
      $group: {
        _id: '$channel',
        campaignIds: { $addToSet: '$_id' },
        totalSpend: { $sum: '$budget' },
        campaignCount: { $sum: 1 },
      },
    },
  ]);

  if (campaigns.length === 0) return [];

  // Build channel → campaignIds map
  const channelCampaignMap = new Map<string, { campaignIds: unknown[]; totalSpend: number; campaignCount: number }>();
  const allCampaignIds: unknown[] = [];

  for (const c of campaigns) {
    channelCampaignMap.set(c._id, {
      campaignIds: c.campaignIds,
      totalSpend: c.totalSpend ?? 0,
      campaignCount: c.campaignCount,
    });
    allCampaignIds.push(...c.campaignIds);
  }

  // Step 2: Get leads attributed to these campaigns
  const leads = await deps.LeadModel.aggregate([
    {
      $match: {
        campaignId: { $in: allCampaignIds },
        isDeleted: { $ne: true },
      },
    },
    {
      $group: {
        _id: '$campaignId',
        leadCount: { $sum: 1 },
        convertedOrderIds: {
          $addToSet: {
            $cond: [
              { $and: ['$isConverted', { $ne: ['$convertedOrderId', null] }] },
              '$convertedOrderId',
              '$$REMOVE',
            ],
          },
        },
        convertedCount: {
          $sum: { $cond: ['$isConverted', 1, 0] },
        },
      },
    },
  ]);

  // Map campaignId → lead stats
  const campaignLeadMap = new Map<string, { leadCount: number; convertedOrderIds: unknown[]; convertedCount: number }>();
  const allOrderIds: unknown[] = [];

  for (const l of leads) {
    const orderIds = (l.convertedOrderIds ?? []).filter((id: unknown) => id != null);
    campaignLeadMap.set(String(l._id), {
      leadCount: l.leadCount,
      convertedOrderIds: orderIds,
      convertedCount: l.convertedCount,
    });
    allOrderIds.push(...orderIds);
  }

  // Step 3: Get revenue from payments linked to converted orders
  let orderPaymentMap = new Map<string, number>();

  if (allOrderIds.length > 0) {
    const payments = await deps.PaymentModel.aggregate([
      {
        $match: {
          orderId: { $in: allOrderIds },
          status: { $in: [...REVENUE_PAYMENT_STATUSES] },
        },
      },
      {
        $group: {
          _id: '$orderId',
          revenue: { $sum: '$amount' },
        },
      },
    ]);

    orderPaymentMap = new Map(
      payments.map((p) => [String(p._id), p.revenue as number]),
    );
  }

  // Assemble results per channel
  const results: ChannelRoiEntry[] = [];

  for (const [channel, campaignData] of channelCampaignMap) {
    let totalLeads = 0;
    let totalConverted = 0;
    let totalRevenue = 0;

    for (const campaignId of campaignData.campaignIds) {
      const leadData = campaignLeadMap.get(String(campaignId));
      if (!leadData) continue;

      totalLeads += leadData.leadCount;
      totalConverted += leadData.convertedCount;

      for (const orderId of leadData.convertedOrderIds) {
        totalRevenue += orderPaymentMap.get(String(orderId)) ?? 0;
      }
    }

    const spend = campaignData.totalSpend;
    const roi = spend > 0
      ? Math.round(((totalRevenue - spend) / spend) * 100) / 100
      : null;
    const costPerLead = totalLeads > 0
      ? Math.round(spend / totalLeads)
      : null;
    const costPerConversion = totalConverted > 0
      ? Math.round(spend / totalConverted)
      : null;

    results.push({
      channel,
      campaignCount: campaignData.campaignCount,
      totalSpend: spend,
      totalLeads,
      totalConverted,
      conversionRate: totalLeads > 0
        ? Math.round((totalConverted / totalLeads) * 100) / 100
        : 0,
      totalRevenue,
      roi,
      costPerLead,
      costPerConversion,
    });
  }

  // Sort by totalRevenue descending
  results.sort((a, b) => b.totalRevenue - a.totalRevenue);

  return results;
}
