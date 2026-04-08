import type { Model, Document } from 'mongoose';
import type { DateRangeParams, PipelineStageEntry } from '../types';
import { LEAD_STATUS_NAMES } from '../constants';

/**
 * Pipeline health: lead metrics by status stage (1-8).
 */
export async function getPipelineHealth(
  LeadModel: Model<Document>,
  _LeadActivityModel: Model<Document>,
  dateRange: DateRangeParams,
): Promise<PipelineStageEntry[]> {
  const now = new Date();

  const stageStats = await LeadModel.aggregate([
    {
      $match: {
        createdAt: {
          $gte: new Date(dateRange.dateFrom),
          $lte: new Date(dateRange.dateTo),
        },
        isDeleted: { $ne: true },
      },
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalValue: { $sum: '$estimatedValue' },
        avgAge: {
          $avg: {
            $divide: [{ $subtract: [now, '$createdAt'] }, 86400000], // days
          },
        },
        convertedCount: {
          $sum: { $cond: ['$isConverted', 1, 0] },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Get total leads for conversion rate calculation
  const totalLeads = stageStats.reduce((sum, s) => sum + s.count, 0);
  const avgTimePerStage = totalLeads > 0
    ? stageStats.reduce((sum, s) => sum + (s.avgAge ?? 0), 0) / stageStats.length
    : 0;

  return stageStats.map((stage) => {
    const status = stage._id as number;
    const avgAge = Math.round(stage.avgAge ?? 0);

    return {
      status,
      statusName: LEAD_STATUS_NAMES[status] ?? `Status ${status}`,
      count: stage.count,
      totalValue: stage.totalValue ?? 0,
      averageValue: stage.count > 0 ? Math.round(stage.totalValue / stage.count) : 0,
      conversionRate: status <= 6
        ? (stage.count > 0
          ? Math.round((stage.convertedCount / stage.count) * 100) / 100
          : 0)
        : null,
      avgAgeDays: avgAge,
      bottleneck: avgAge > avgTimePerStage * 1.5 && stage.count > 3,
    };
  });
}
