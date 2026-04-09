/**
 * Pipeline Health Service — Lead funnel analysis by stage
 */

import type { Model, Document } from 'mongoose';
import type { DateRangeParams, PipelineStageEntry } from '../types';
import { LEAD_STATUS_NAMES } from '../constants';

/**
 * Get pipeline health: count, value, conversion rate, avg time per stage.
 */
export async function getPipelineHealth(
  LeadModel: Model<Document>,
  LeadActivityModel: Model<Document>,
  dateRange: DateRangeParams,
): Promise<PipelineStageEntry[]> {
  // Count and value by stage
  const stageCounts = await LeadModel.aggregate([
    {
      $match: {
        createdAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo },
        isDeleted: { $ne: true },
      },
    },
    { $project: { status: 1, estimatedValue: 1 } }, // Only need these fields
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalValueCents: { $sum: { $ifNull: ['$estimatedValue', 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Average time between status changes
  const stageTransitions = await LeadActivityModel.aggregate([
    {
      $match: {
        type: 'status_change',
        createdAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo },
      },
    },
    {
      $group: {
        _id: '$leadId',
        transitions: {
          $push: { date: '$createdAt' },
        },
      },
    },
  ]);

  // Calculate avg days per stage from transitions
  const stageDaysMap = new Map<number, number[]>();
  for (const lead of stageTransitions) {
    const sorted = (lead.transitions as Array<{ date: Date }>)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    for (let i = 1; i < sorted.length; i++) {
      const days = (new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime())
        / (1000 * 60 * 60 * 24);
      const stageNum = i; // approximate stage index
      if (!stageDaysMap.has(stageNum)) stageDaysMap.set(stageNum, []);
      stageDaysMap.get(stageNum)!.push(days);
    }
  }

  // Build result for stages 1-8
  const maxCount = Math.max(...stageCounts.map((s: { count: number }) => s.count), 1);

  const result: PipelineStageEntry[] = [];
  for (let stage = 1; stage <= 8; stage++) {
    const stageData = stageCounts.find((s: { _id: number }) => s._id === stage);
    const count = stageData?.count ?? 0;
    const totalValueCents = stageData?.totalValueCents ?? 0;

    const daysArr = stageDaysMap.get(stage) ?? [];
    const avgDaysInStage = daysArr.length > 0
      ? Math.round(daysArr.reduce((a, b) => a + b, 0) / daysArr.length)
      : 0;

    // Conversion rate: leads that moved past this stage / leads that entered
    const nextStageCount = stageCounts
      .filter((s: { _id: number }) => s._id > stage)
      .reduce((sum: number, s: { count: number }) => sum + s.count, 0);
    const conversionRate = count > 0 ? nextStageCount / (count + nextStageCount) : 0;

    result.push({
      stage,
      stageName: LEAD_STATUS_NAMES[stage] ?? `Stage ${stage}`,
      count,
      totalValueCents,
      conversionRate: Math.round(conversionRate * 100) / 100,
      avgDaysInStage,
      isBottleneck: count === maxCount && count > 0 && stage < 6,
    });
  }

  return result;
}
