/**
 * Staff Benchmark Service — Cross-collection staff performance metrics
 *
 * 4 parallel aggregations (Orders, LeadActivity, ReviewAssignment, SupportTicket)
 * merged by staffId via in-memory Map.
 */

import type { Model } from 'mongoose';
import type { DateRangeParams, StaffBenchmarkEntry } from '../types';

export interface StaffBenchmarkDeps {
  OrderModel: Model<any>;
  LeadActivityModel: Model<any>;
  ReviewAssignmentModel: Model<any>;
  SupportTicketModel: Model<any>;
  UserModel: Model<any>;
}

/**
 * Compute staff benchmark across 4 dimensions.
 */
export async function getStaffBenchmark(
  deps: StaffBenchmarkDeps,
  dateRange: DateRangeParams,
): Promise<StaffBenchmarkEntry[]> {
  const { OrderModel, LeadActivityModel, ReviewAssignmentModel, SupportTicketModel, UserModel } =
    deps;

  // Run 4 aggregations in parallel (with early $project to minimize pipeline memory)
  const [ordersCompleted, leadsContacted, reviewTimes, ticketsResolved] = await Promise.all([
    // 1. Orders completed by processingBy staff
    OrderModel.aggregate([
      {
        $match: {
          status: { $in: [6, 7, 8] }, // Completed, Lodged, Assessed
          updatedAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo },
          processingBy: { $exists: true, $ne: null },
          isDeleted: { $ne: true },
        },
      },
      { $project: { processingBy: 1 } },
      {
        $group: {
          _id: '$processingBy',
          ordersCompleted: { $sum: 1 },
        },
      },
    ]),

    // 2. Lead activities by performedBy staff
    LeadActivityModel.aggregate([
      {
        $match: {
          createdAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo },
          type: { $in: ['phone_call_outbound', 'phone_call_inbound', 'sms_sent', 'email_sent'] },
        },
      },
      { $project: { performedBy: 1 } },
      {
        $group: {
          _id: '$performedBy',
          leadsContacted: { $sum: 1 },
        },
      },
    ]),

    // 3. Review turnaround by reviewer
    ReviewAssignmentModel.aggregate([
      {
        $match: {
          status: 'approved',
          updatedAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo },
          timeToReview: { $exists: true },
        },
      },
      { $project: { reviewerId: 1, timeToReview: 1 } },
      {
        $group: {
          _id: '$reviewerId',
          avgReviewMinutes: { $avg: '$timeToReview' },
        },
      },
    ]),

    // 4. Tickets resolved by assignedTo
    SupportTicketModel.aggregate([
      {
        $match: {
          status: 'resolved',
          resolvedAt: { $gte: dateRange.dateFrom, $lte: dateRange.dateTo },
        },
      },
      { $project: { assignedTo: 1 } },
      {
        $group: {
          _id: '$assignedTo',
          ticketsResolved: { $sum: 1 },
        },
      },
    ]),
  ]);

  // Merge into Map by staffId
  const staffMap = new Map<
    string,
    {
      ordersCompleted: number;
      leadsContacted: number;
      avgReviewMinutes: number;
      ticketsResolved: number;
    }
  >();

  const ensureEntry = (id: string): void => {
    if (!staffMap.has(id)) {
      staffMap.set(id, {
        ordersCompleted: 0,
        leadsContacted: 0,
        avgReviewMinutes: 0,
        ticketsResolved: 0,
      });
    }
  };

  for (const o of ordersCompleted) {
    const id = String(o._id);
    ensureEntry(id);
    staffMap.get(id)!.ordersCompleted = o.ordersCompleted;
  }
  for (const l of leadsContacted) {
    const id = String(l._id);
    ensureEntry(id);
    staffMap.get(id)!.leadsContacted = l.leadsContacted;
  }
  for (const r of reviewTimes) {
    const id = String(r._id);
    ensureEntry(id);
    staffMap.get(id)!.avgReviewMinutes = Math.round(r.avgReviewMinutes);
  }
  for (const t of ticketsResolved) {
    const id = String(t._id);
    ensureEntry(id);
    staffMap.get(id)!.ticketsResolved = t.ticketsResolved;
  }

  // Fetch staff display names
  const staffIds = [...staffMap.keys()];
  const users = await UserModel.find(
    { _id: { $in: staffIds } },
    { firstName: 1, lastName: 1 },
  ).lean();

  const nameMap = new Map(
    users.map((u: Record<string, unknown>) => [
      String(u._id),
      `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
    ]),
  );

  return staffIds
    .map((id) => {
      const data = staffMap.get(id)!;
      return {
        staffId: id,
        displayName: nameMap.get(id) ?? 'Unknown',
        ...data,
      };
    })
    .sort((a, b) => b.ordersCompleted - a.ordersCompleted);
}
