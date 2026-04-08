import type { Model, Document } from 'mongoose';
import type {
  WorkloadConfig,
  WorkloadWeights,
  WorkloadCapacity,
  StaffWorkloadSnapshot,
  AssignmentRequest,
  AssignmentResult,
} from './workload.types';
import {
  DEFAULT_WEIGHTS,
  DEFAULT_CAPACITY,
  DEFAULT_ELIGIBLE_USER_TYPES,
} from './workload.types';

interface WorkloadServiceDeps {
  UserModel: Model<Document>;
  LeadModel: Model<Document>;
  OrderModel: Model<Document>;
  ReviewAssignmentModel: Model<Document>;
  SupportTicketModel: Model<Document>;
  AppointmentModel: Model<Document>;
}

export interface WorkloadServiceResult {
  getStaffWorkloads: (staffIds?: string[]) => Promise<StaffWorkloadSnapshot[]>;
  getStaffWorkload: (staffId: string) => Promise<StaffWorkloadSnapshot | null>;
  smartAssign: (request: AssignmentRequest) => Promise<AssignmentResult | null>;
  smartAssignBulk: (count: number, request: AssignmentRequest) => Promise<AssignmentResult[]>;
}

export function createWorkloadService(
  deps: WorkloadServiceDeps,
  config?: WorkloadConfig,
): WorkloadServiceResult {
  const weights: WorkloadWeights = { ...DEFAULT_WEIGHTS, ...config?.weights };
  const capacity: WorkloadCapacity = { ...DEFAULT_CAPACITY, ...config?.capacity };
  const eligibleUserTypes = config?.eligibleUserTypes ?? DEFAULT_ELIGIBLE_USER_TYPES;

  /**
   * Compute workload snapshots for all eligible staff (or a subset).
   * Runs 5 aggregation queries in parallel for performance.
   */
  async function getStaffWorkloads(staffIds?: string[]): Promise<StaffWorkloadSnapshot[]> {
    // Get eligible staff
    const staffFilter: Record<string, unknown> = {
      status: true,
      isDeleted: { $ne: true },
      userType: { $in: eligibleUserTypes },
    };
    if (staffIds && staffIds.length > 0) {
      staffFilter._id = { $in: staffIds };
    }

    const staff = await deps.UserModel.find(staffFilter)
      .select('_id firstName lastName email userType')
      .lean() as Array<{ _id: unknown; firstName?: string; lastName?: string; email?: string; userType: number }>;

    if (staff.length === 0) return [];

    const ids = staff.map((s) => s._id);
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // 5 parallel aggregations — one per workload dimension
    const [leadCounts, orderCounts, reviewCounts, ticketCounts, appointmentCounts] = await Promise.all([
      // Active leads per staff (status 1-5: New through Negotiation)
      deps.LeadModel.aggregate([
        { $match: { assignedTo: { $in: ids }, status: { $in: [1, 2, 3, 4, 5] }, isDeleted: { $ne: true } } },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      ]) as Promise<Array<{ _id: unknown; count: number }>>,

      // Orders in progress per staff (status 1-5: pre-completion)
      deps.OrderModel.aggregate([
        { $match: { processingBy: { $in: ids }, status: { $in: [1, 2, 3, 4, 5] }, isDeleted: { $ne: true } } },
        { $group: { _id: '$processingBy', count: { $sum: 1 } } },
      ]) as Promise<Array<{ _id: unknown; count: number }>>,

      // Pending reviews per staff
      deps.ReviewAssignmentModel.aggregate([
        { $match: { reviewerId: { $in: ids }, status: { $in: ['pending_review', 'in_review'] } } },
        { $group: { _id: '$reviewerId', count: { $sum: 1 } } },
      ]) as Promise<Array<{ _id: unknown; count: number }>>,

      // Open tickets per staff
      deps.SupportTicketModel.aggregate([
        { $match: { assignedTo: { $in: ids }, status: { $in: ['open', 'in_progress', 'waiting_customer'] } } },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      ]) as Promise<Array<{ _id: unknown; count: number }>>,

      // Upcoming appointments (next 48h) per staff
      deps.AppointmentModel.aggregate([
        {
          $match: {
            staffId: { $in: ids },
            date: { $gte: now, $lte: in48h },
            status: { $in: ['scheduled', 'confirmed'] },
            isDeleted: { $ne: true },
          },
        },
        { $group: { _id: '$staffId', count: { $sum: 1 } } },
      ]) as Promise<Array<{ _id: unknown; count: number }>>,
    ]);

    // Build lookup maps
    const toMap = (arr: Array<{ _id: unknown; count: number }>): Map<string, number> =>
      new Map(arr.map((a) => [String(a._id), a.count]));

    const leadMap = toMap(leadCounts);
    const orderMap = toMap(orderCounts);
    const reviewMap = toMap(reviewCounts);
    const ticketMap = toMap(ticketCounts);
    const appointmentMap = toMap(appointmentCounts);

    return staff.map((s) => {
      const staffId = String(s._id);
      const activeLeads = leadMap.get(staffId) ?? 0;
      const ordersInProgress = orderMap.get(staffId) ?? 0;
      const pendingReviews = reviewMap.get(staffId) ?? 0;
      const openTickets = ticketMap.get(staffId) ?? 0;
      const upcomingAppointments = appointmentMap.get(staffId) ?? 0;

      // Weighted workload score
      const workloadScore = Math.round((
        activeLeads * weights.activeLeads +
        ordersInProgress * weights.ordersInProgress +
        pendingReviews * weights.pendingReviews +
        openTickets * weights.openTickets +
        upcomingAppointments * weights.upcomingAppointments
      ) * 100) / 100;

      // Capacity check
      const capacityBreaches: string[] = [];
      if (activeLeads >= capacity.maxLeads) capacityBreaches.push('leads');
      if (ordersInProgress >= capacity.maxOrders) capacityBreaches.push('orders');
      if (pendingReviews >= capacity.maxReviews) capacityBreaches.push('reviews');
      if (openTickets >= capacity.maxTickets) capacityBreaches.push('tickets');
      if (upcomingAppointments >= capacity.maxAppointmentsPerDay) capacityBreaches.push('appointments');

      return {
        staffId,
        name: `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim(),
        email: s.email ?? '',
        userType: s.userType,
        activeLeads,
        ordersInProgress,
        pendingReviews,
        openTickets,
        upcomingAppointments,
        workloadScore,
        isAtCapacity: capacityBreaches.length > 0,
        capacityBreaches,
      };
    });
  }

  /**
   * Get workload for a single staff member.
   */
  async function getStaffWorkload(staffId: string): Promise<StaffWorkloadSnapshot | null> {
    const results = await getStaffWorkloads([staffId]);
    return results[0] ?? null;
  }

  /**
   * Smart assignment: pick the best available staff member.
   * Factors: workload score (lowest wins), capacity limits, exclusions, userType requirements.
   */
  async function smartAssign(request: AssignmentRequest): Promise<AssignmentResult | null> {
    const all = await getStaffWorkloads();

    let candidates = all
      // Exclude staff at capacity
      .filter((s) => !s.isAtCapacity)
      // Exclude specific context capacity
      .filter((s) => {
        switch (request.context) {
          case 'lead': return s.activeLeads < capacity.maxLeads;
          case 'order': return s.ordersInProgress < capacity.maxOrders;
          case 'review': return s.pendingReviews < capacity.maxReviews;
          case 'ticket': return s.openTickets < capacity.maxTickets;
          case 'appointment': return s.upcomingAppointments < capacity.maxAppointmentsPerDay;
          default: return true;
        }
      });

    // Apply exclusions (e.g., self-review block)
    if (request.excludeStaffIds && request.excludeStaffIds.length > 0) {
      const excluded = new Set(request.excludeStaffIds);
      candidates = candidates.filter((s) => !excluded.has(s.staffId));
    }

    // Apply userType requirement (e.g., senior-only for complex reviews)
    if (request.requiredUserTypes && request.requiredUserTypes.length > 0) {
      const required = new Set(request.requiredUserTypes);
      candidates = candidates.filter((s) => required.has(s.userType));
    }

    if (candidates.length === 0) return null;

    // Sort by workload score ascending (least loaded first)
    candidates.sort((a, b) => a.workloadScore - b.workloadScore);

    const best = candidates[0];
    return {
      staffId: best.staffId,
      name: best.name,
      workloadScore: best.workloadScore,
      reason: `Lowest workload score (${best.workloadScore}) among ${candidates.length} eligible staff`,
    };
  }

  /**
   * Bulk smart assignment: assign N items, distributing across staff.
   * Simulates incremental load to avoid assigning all to the same person.
   */
  async function smartAssignBulk(
    count: number,
    request: AssignmentRequest,
  ): Promise<AssignmentResult[]> {
    const all = await getStaffWorkloads();
    const results: AssignmentResult[] = [];

    // Build mutable working copy of scores
    const scoreMap = new Map<string, number>();
    for (const s of all) {
      scoreMap.set(s.staffId, s.workloadScore);
    }

    // Weight increment per assignment based on context
    const contextWeight: Record<string, number> = {
      lead: weights.activeLeads,
      order: weights.ordersInProgress,
      review: weights.pendingReviews,
      ticket: weights.openTickets,
      appointment: weights.upcomingAppointments,
    };
    const increment = contextWeight[request.context] ?? 1;

    for (let i = 0; i < count; i++) {
      let candidates = all
        .filter((s) => !s.isAtCapacity);

      if (request.excludeStaffIds && request.excludeStaffIds.length > 0) {
        const excluded = new Set(request.excludeStaffIds);
        candidates = candidates.filter((s) => !excluded.has(s.staffId));
      }

      if (request.requiredUserTypes && request.requiredUserTypes.length > 0) {
        const required = new Set(request.requiredUserTypes);
        candidates = candidates.filter((s) => required.has(s.userType));
      }

      if (candidates.length === 0) break;

      // Sort by simulated score
      candidates.sort((a, b) => {
        const scoreA = scoreMap.get(a.staffId) ?? a.workloadScore;
        const scoreB = scoreMap.get(b.staffId) ?? b.workloadScore;
        return scoreA - scoreB;
      });

      const best = candidates[0];
      results.push({
        staffId: best.staffId,
        name: best.name,
        workloadScore: scoreMap.get(best.staffId) ?? best.workloadScore,
        reason: `Assignment ${i + 1}/${count}: score ${scoreMap.get(best.staffId)?.toFixed(2)}`,
      });

      // Increment simulated score for next iteration
      scoreMap.set(best.staffId, (scoreMap.get(best.staffId) ?? 0) + increment);
    }

    return results;
  }

  return {
    getStaffWorkloads,
    getStaffWorkload,
    smartAssign,
    smartAssignBulk,
  };
}
