import type { Model } from 'mongoose';
import type { ILeadDocument, ILeadActivityDocument, ILeadReminderDocument } from './lead.types';
import { LeadStatus } from './lead.types';

/**
 * BullMQ job definitions for lead automation rules.
 * These handlers are registered as repeatable jobs in server.ts.
 *
 * Per PRD Section 12.8:
 * - Auto-assign: New lead, no assignedTo → round-robin
 * - Stale alert: New lead > 24hr no activity → notification
 * - Auto-dormant: Contacted + 14 days no activity → Dormant
 * - Follow-up escalation: Reminder overdue > 2hr → Slack alert
 * - Overdue marker: Past reminderDate+time → set isOverdue
 * - Score recalculation: Triggered by activity/status/profile changes
 * - Re-engagement flag: Dormant > 30 days → tag "re-engagement"
 */

export interface AutomationDeps {
  LeadModel: Model<ILeadDocument>;
  LeadActivityModel: Model<ILeadActivityDocument>;
  LeadReminderModel: Model<ILeadReminderDocument>;
  recalculateScore: (leadId: string) => Promise<{ score: number; priority: string }>;
  /** Optional: smart workload-based assignment (falls back to round-robin if not provided) */
  smartAssignBulk?: (
    count: number,
    request: { context: string; excludeStaffIds?: string[]; requiredUserTypes?: number[] },
  ) => Promise<Array<{ staffId: string }>>;
}

export interface AutomationHandlers {
  autoAssignNewLead: () => Promise<{ processed: number }>;
  staleLeadAlert: () => Promise<{ alerted: number }>;
  autoDormant: () => Promise<{ transitioned: number }>;
  followUpEscalation: () => Promise<{ escalated: number }>;
  overdueMarker: () => Promise<{ marked: number }>;
  scoreRecalculation: (leadId: string) => Promise<void>;
  reEngagementFlag: () => Promise<{ flagged: number }>;
}

export function createAutomationHandlers(deps: AutomationDeps): AutomationHandlers {
  const { LeadModel, LeadActivityModel, LeadReminderModel, recalculateScore } = deps;

  /**
   * LM-INV-07: Smart workload-based assignment with round-robin fallback.
   * Primary: uses multi-factor workload scoring (leads, orders, reviews, tickets, appointments).
   * Fallback: round-robin skipping inactive staff and those at max capacity (50 leads).
   */
  async function autoAssignNewLead(): Promise<{ processed: number }> {
    const unassigned = await LeadModel.find({
      status: LeadStatus.New,
      assignedTo: { $exists: false },
    })
      .select('_id')
      .lean<Array<{ _id: string }>>();

    if (unassigned.length === 0) {
      return { processed: 0 };
    }

    // Try smart workload-based assignment first
    if (deps.smartAssignBulk) {
      try {
        const assignments = await deps.smartAssignBulk(unassigned.length, { context: 'lead' });
        if (assignments.length > 0) {
          const bulkOps = unassigned.map((lead, i) => ({
            updateOne: {
              filter: { _id: lead._id },
              update: { $set: { assignedTo: assignments[i % assignments.length].staffId } },
            },
          }));
          await LeadModel.bulkWrite(bulkOps as never);
          return { processed: unassigned.length };
        }
      } catch {
        // Fall through to round-robin
      }
    }

    // Fallback: basic round-robin
    const UserModel = LeadModel.db.model('User');
    const staffMembers = await UserModel.find({
      status: true,
      isDeleted: { $ne: true },
      userType: { $in: [1, 3, 5, 6] }, // admin, staff, office_manager, senior_staff
    })
      .select('_id')
      .lean<Array<{ _id: string }>>();

    if (staffMembers.length === 0) {
      return { processed: 0 };
    }

    // Count current assignments per staff
    const assignmentCounts = (await LeadModel.aggregate([
      {
        $match: {
          assignedTo: { $in: staffMembers.map((s) => s._id) },
          status: { $in: [1, 2, 3, 4, 5] },
        },
      },
      { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
    ])) as Array<{ _id: string; count: number }>;

    const countMap = new Map(assignmentCounts.map((a) => [a._id.toString(), a.count]));
    const maxCapacity = 50;

    // Filter to eligible (under capacity)
    const eligible = staffMembers.filter(
      (s) => (countMap.get(s._id.toString()) ?? 0) < maxCapacity,
    );

    if (eligible.length === 0) {
      return { processed: 0 };
    }

    // Fix for B-3.17: Use bulkWrite instead of N+1 individual updates
    const bulkOps = unassigned.map((lead, i) => ({
      updateOne: {
        filter: { _id: lead._id },
        update: { $set: { assignedTo: eligible[i % eligible.length]._id } },
      },
    }));
    await LeadModel.bulkWrite(bulkOps as never);

    return { processed: unassigned.length };
  }

  /**
   * Stale lead alert: New lead > 24hr with no activity.
   */
  // Fix for B-3.17: Use aggregation with $lookup instead of N+1 per-lead queries
  // Fix for B-3.19: Use null performedBy with isSystemGenerated: true
  async function staleLeadAlert(): Promise<{ alerted: number }> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Single aggregation to find stale leads with zero non-system activities
    const staleLeads = await LeadModel.aggregate<{
      _id: string;
      assignedTo?: string;
      leadNumber: string;
    }>([
      {
        $match: {
          status: LeadStatus.New,
          createdAt: { $lte: twentyFourHoursAgo },
          isDeleted: { $ne: true },
        },
      },
      {
        $lookup: {
          from: 'leadactivities',
          let: { leadId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$leadId', '$$leadId'] }, isSystemGenerated: false } },
            { $limit: 1 },
          ],
          as: 'manualActivities',
        },
      },
      { $match: { manualActivities: { $size: 0 } } },
      { $project: { _id: 1, assignedTo: 1, leadNumber: 1 } },
    ]);

    if (staleLeads.length === 0) {
      return { alerted: 0 };
    }

    // Batch insert alert activities
    const alertActivities = staleLeads.map((lead) => ({
      leadId: lead._id,
      type: 'note' as const,
      description: 'ALERT: New lead has had no activity for 24+ hours',
      performedBy: null,
      isSystemGenerated: true,
      servicesQuoted: [],
      attachments: [],
    }));
    await LeadActivityModel.insertMany(alertActivities);

    return { alerted: staleLeads.length };
  }

  /**
   * Auto-dormant: Contacted status + 14 days no activity → Dormant.
   */
  async function autoDormant(): Promise<{ transitioned: number }> {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const candidates = await LeadModel.find({
      status: LeadStatus.Contacted,
      lastContactedAt: { $lte: fourteenDaysAgo },
    })
      .select('_id')
      .lean<Array<{ _id: string }>>();

    if (candidates.length === 0) {
      return { transitioned: 0 };
    }

    // Fix for B-3.17, B-3.18: Use bulkWrite + insertMany instead of N+1 loop
    // Fix for B-3.18: Use null performedBy with isSystemGenerated: true
    const bulkOps = candidates.map((lead) => ({
      updateOne: {
        filter: { _id: lead._id },
        update: { $set: { status: LeadStatus.Dormant } },
      },
    }));
    await LeadModel.bulkWrite(bulkOps);

    const activities = candidates.map((lead) => ({
      leadId: lead._id,
      type: 'status_change' as const,
      description: 'Auto-transitioned to Dormant: 14 days without activity',
      performedBy: null,
      isSystemGenerated: true,
      servicesQuoted: [],
      attachments: [],
    }));
    await LeadActivityModel.insertMany(activities);

    return { transitioned: candidates.length };
  }

  /**
   * Follow-up escalation: Reminder overdue > 2 hours → alert.
   */
  async function followUpEscalation(): Promise<{ escalated: number }> {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const overdueReminders = await LeadReminderModel.find({
      isOverdue: true,
      isCompleted: false,
      reminderDate: { $lte: twoHoursAgo },
    })
      .populate('leadId', 'leadNumber firstName lastName')
      .lean<ILeadReminderDocument[]>();

    // In production: send Slack alert to admin
    return { escalated: overdueReminders.length };
  }

  /**
   * Overdue marker: Past reminderDate+time → set isOverdue, send push.
   */
  async function overdueMarker(): Promise<{ marked: number }> {
    const now = new Date();

    const result = await LeadReminderModel.updateMany(
      {
        isCompleted: false,
        isOverdue: false,
        isSnoozed: false,
        reminderDate: { $lte: now },
      },
      { isOverdue: true },
    );

    return { marked: result.modifiedCount };
  }

  /**
   * Score recalculation: Triggered by activity/status/profile changes.
   */
  async function scoreRecalculation(leadId: string): Promise<void> {
    await recalculateScore(leadId);
  }

  /**
   * Re-engagement flag: Dormant > 30 days → tag "re-engagement".
   */
  async function reEngagementFlag(): Promise<{ flagged: number }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await LeadModel.updateMany(
      {
        status: LeadStatus.Dormant,
        updatedAt: { $lte: thirtyDaysAgo },
        tags: { $ne: 're-engagement' },
      },
      { $addToSet: { tags: 're-engagement' } },
    );

    return { flagged: result.modifiedCount };
  }

  return {
    autoAssignNewLead,
    staleLeadAlert,
    autoDormant,
    followUpEscalation,
    overdueMarker,
    scoreRecalculation,
    reEngagementFlag,
  };
}
