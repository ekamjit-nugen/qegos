import type { Model, Document } from 'mongoose';
import type { DateRangeParams, StaffBenchmarkEntry } from '../types';

/**
 * Staff benchmark: performance metrics across orders, leads, reviews, and tickets.
 * 4 parallel aggregations merged by staffId via in-memory Map.
 */
export async function getStaffBenchmark(
  deps: {
    OrderModel: Model<Document>;
    LeadActivityModel: Model<Document>;
    ReviewAssignmentModel: Model<Document>;
    SupportTicketModel: Model<Document>;
    UserModel: Model<Document>;
  },
  dateRange: DateRangeParams,
): Promise<StaffBenchmarkEntry[]> {
  const dateFilter = {
    $gte: new Date(dateRange.dateFrom),
    $lte: new Date(dateRange.dateTo),
  };

  // 4 parallel aggregations
  const [orderStats, leadStats, reviewStats, ticketStats] = await Promise.all([
    // Orders completed per staff
    deps.OrderModel.aggregate([
      {
        $match: {
          createdAt: dateFilter,
          assignedTo: { $exists: true, $ne: null },
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: '$assignedTo',
          ordersCompleted: {
            $sum: { $cond: [{ $in: ['$status', [6, 7, 8]] }, 1, 0] },
          },
          ordersTotal: { $sum: 1 },
          totalRevenue: {
            $sum: { $cond: [{ $in: ['$status', [6, 7, 8]] }, '$totalAmount', 0] },
          },
          avgCompletionDays: {
            $avg: {
              $cond: [
                { $and: [{ $in: ['$status', [6, 7, 8]] }, { $ne: ['$completedAt', null] }] },
                { $divide: [{ $subtract: ['$completedAt', '$createdAt'] }, 86400000] },
                null,
              ],
            },
          },
        },
      },
    ]),

    // Lead activities per staff
    deps.LeadActivityModel.aggregate([
      {
        $match: {
          createdAt: dateFilter,
          performedBy: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: '$performedBy',
          leadActivities: { $sum: 1 },
          leadsContacted: { $addToSet: '$leadId' },
        },
      },
      {
        $addFields: {
          leadsContacted: { $size: '$leadsContacted' },
        },
      },
    ]),

    // Review assignments per staff
    deps.ReviewAssignmentModel.aggregate([
      {
        $match: {
          createdAt: dateFilter,
          reviewerId: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: '$reviewerId',
          reviewsCompleted: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          reviewsTotal: { $sum: 1 },
          avgReviewTimeDays: {
            $avg: {
              $cond: [
                { $and: [{ $eq: ['$status', 'completed'] }, { $ne: ['$completedAt', null] }] },
                { $divide: [{ $subtract: ['$completedAt', '$createdAt'] }, 86400000] },
                null,
              ],
            },
          },
        },
      },
    ]),

    // Support tickets resolved per staff
    deps.SupportTicketModel.aggregate([
      {
        $match: {
          createdAt: dateFilter,
          assignedTo: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: '$assignedTo',
          ticketsResolved: {
            $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] },
          },
          ticketsTotal: { $sum: 1 },
          avgResolutionHours: {
            $avg: {
              $cond: [
                { $and: [{ $eq: ['$status', 'resolved'] }, { $ne: ['$resolvedAt', null] }] },
                { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 3600000] },
                null,
              ],
            },
          },
        },
      },
    ]),
  ]);

  // Merge by staffId via in-memory Map
  const staffMap = new Map<string, Record<string, unknown>>();

  const ensureEntry = (id: string): Record<string, unknown> => {
    const key = String(id);
    if (!staffMap.has(key)) {
      staffMap.set(key, {
        staffId: key,
        ordersCompleted: 0,
        ordersTotal: 0,
        totalRevenue: 0,
        avgCompletionDays: null,
        leadActivities: 0,
        leadsContacted: 0,
        reviewsCompleted: 0,
        reviewsTotal: 0,
        avgReviewTimeDays: null,
        ticketsResolved: 0,
        ticketsTotal: 0,
        avgResolutionHours: null,
      });
    }
    return staffMap.get(key)!;
  };

  for (const o of orderStats) {
    const e = ensureEntry(o._id);
    e.ordersCompleted = o.ordersCompleted;
    e.ordersTotal = o.ordersTotal;
    e.totalRevenue = o.totalRevenue;
    e.avgCompletionDays = o.avgCompletionDays != null ? Math.round(o.avgCompletionDays * 10) / 10 : null;
  }

  for (const l of leadStats) {
    const e = ensureEntry(l._id);
    e.leadActivities = l.leadActivities;
    e.leadsContacted = l.leadsContacted;
  }

  for (const r of reviewStats) {
    const e = ensureEntry(r._id);
    e.reviewsCompleted = r.reviewsCompleted;
    e.reviewsTotal = r.reviewsTotal;
    e.avgReviewTimeDays = r.avgReviewTimeDays != null ? Math.round(r.avgReviewTimeDays * 10) / 10 : null;
  }

  for (const t of ticketStats) {
    const e = ensureEntry(t._id);
    e.ticketsResolved = t.ticketsResolved;
    e.ticketsTotal = t.ticketsTotal;
    e.avgResolutionHours = t.avgResolutionHours != null ? Math.round(t.avgResolutionHours * 10) / 10 : null;
  }

  // Lookup staff names
  const staffIds = [...staffMap.keys()];
  if (staffIds.length === 0) return [];

  const staffUsers = await deps.UserModel.find(
    { _id: { $in: staffIds } },
    { firstName: 1, lastName: 1, email: 1 },
  ).lean();

  const userMap = new Map<string, { name: string; email: string }>();
  for (const u of staffUsers as Array<{ _id: unknown; firstName?: string; lastName?: string; email?: string }>) {
    userMap.set(String(u._id), {
      name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
      email: u.email ?? '',
    });
  }

  const results: StaffBenchmarkEntry[] = [];
  for (const [staffId, data] of staffMap) {
    const user = userMap.get(staffId);
    results.push({
      staffId,
      name: user?.name ?? '',
      email: user?.email ?? '',
      ordersCompleted: data.ordersCompleted as number,
      ordersTotal: data.ordersTotal as number,
      totalRevenue: data.totalRevenue as number,
      avgCompletionDays: data.avgCompletionDays as number | null,
      leadActivities: data.leadActivities as number,
      leadsContacted: data.leadsContacted as number,
      reviewsCompleted: data.reviewsCompleted as number,
      reviewsTotal: data.reviewsTotal as number,
      avgReviewTimeDays: data.avgReviewTimeDays as number | null,
      ticketsResolved: data.ticketsResolved as number,
      ticketsTotal: data.ticketsTotal as number,
      avgResolutionHours: data.avgResolutionHours as number | null,
    });
  }

  // Sort by ordersCompleted descending
  results.sort((a, b) => b.ordersCompleted - a.ordersCompleted);

  return results;
}
