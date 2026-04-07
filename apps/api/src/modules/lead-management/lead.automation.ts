import type { Model } from 'mongoose';
import type {
  ILeadDocument,
  ILeadActivityDocument,
  ILeadReminderDocument,
} from './lead.types';
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
   * LM-INV-07: Round-robin assignment.
   * Skips inactive staff and those at max capacity (50 leads).
   */
  async function autoAssignNewLead(): Promise<{ processed: number }> {
    const unassigned = await LeadModel.find({
      status: LeadStatus.New,
      assignedTo: { $exists: false },
    }).select('_id').lean<Array<{ _id: string }>>();

    if (unassigned.length === 0) return { processed: 0 };

    // Get eligible staff — active, userType staff/senior_staff/admin
    const UserModel = LeadModel.db.model('User');
    const staffMembers = await UserModel.find({
      status: true,
      isDeleted: { $ne: true },
      userType: { $in: [1, 3, 5, 6] }, // admin, staff, office_manager, senior_staff
    }).select('_id').lean<Array<{ _id: string }>>();

    if (staffMembers.length === 0) return { processed: 0 };

    // Count current assignments per staff
    const assignmentCounts = await LeadModel.aggregate([
      {
        $match: {
          assignedTo: { $in: staffMembers.map((s) => s._id) },
          status: { $in: [1, 2, 3, 4, 5] },
        },
      },
      { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
    ]) as Array<{ _id: string; count: number }>;

    const countMap = new Map(assignmentCounts.map((a) => [a._id.toString(), a.count]));
    const maxCapacity = 50;

    // Filter to eligible (under capacity)
    const eligible = staffMembers.filter(
      (s) => (countMap.get(s._id.toString()) ?? 0) < maxCapacity,
    );

    if (eligible.length === 0) return { processed: 0 };

    let processed = 0;
    for (let i = 0; i < unassigned.length; i++) {
      const staffIndex = i % eligible.length;
      await LeadModel.findByIdAndUpdate(unassigned[i]._id, {
        assignedTo: eligible[staffIndex]._id,
      });
      processed++;
    }

    return { processed };
  }

  /**
   * Stale lead alert: New lead > 24hr with no activity.
   */
  async function staleLeadAlert(): Promise<{ alerted: number }> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const staleLeads = await LeadModel.find({
      status: LeadStatus.New,
      createdAt: { $lte: twentyFourHoursAgo },
    }).select('_id assignedTo leadNumber').lean<Array<{ _id: string; assignedTo?: string; leadNumber: string }>>();

    let alerted = 0;
    for (const lead of staleLeads) {
      // Check if any activity exists
      const activityCount = await LeadActivityModel.countDocuments({
        leadId: lead._id,
        isSystemGenerated: false,
      });

      if (activityCount === 0) {
        // In production: send push notification + Slack alert
        // For now, log a system activity as alert marker
        await LeadActivityModel.create({
          leadId: lead._id,
          type: 'note',
          description: 'ALERT: New lead has had no activity for 24+ hours',
          performedBy: lead.assignedTo ?? lead._id, // system fallback
          isSystemGenerated: true,
          servicesQuoted: [],
          attachments: [],
        });
        alerted++;
      }
    }

    return { alerted };
  }

  /**
   * Auto-dormant: Contacted status + 14 days no activity → Dormant.
   */
  async function autoDormant(): Promise<{ transitioned: number }> {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const candidates = await LeadModel.find({
      status: LeadStatus.Contacted,
      lastContactedAt: { $lte: fourteenDaysAgo },
    }).select('_id').lean<Array<{ _id: string }>>();

    let transitioned = 0;
    for (const lead of candidates) {
      await LeadModel.findByIdAndUpdate(lead._id, { status: LeadStatus.Dormant });
      await LeadActivityModel.create({
        leadId: lead._id,
        type: 'status_change',
        description: 'Auto-transitioned to Dormant: 14 days without activity',
        performedBy: lead._id, // system
        isSystemGenerated: true,
        servicesQuoted: [],
        attachments: [],
      });
      transitioned++;
    }

    return { transitioned };
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
