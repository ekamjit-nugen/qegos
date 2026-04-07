import type { Model, FilterQuery } from 'mongoose';
import { AppError } from '@nugen/error-handler';
import type {
  ILeadDocument,
  ILeadReminderDocument,
} from './lead.types';

export interface LeadReminderServiceDeps {
  LeadModel: Model<ILeadDocument>;
  LeadReminderModel: Model<ILeadReminderDocument>;
}

export interface ReminderListResult {
  reminders: ILeadReminderDocument[];
  total: number;
}

export interface LeadReminderServiceResult {
  createReminder: (data: Partial<ILeadReminderDocument>) => Promise<ILeadReminderDocument>;
  getReminders: (leadId: string, scopeFilter?: Record<string, unknown>) => Promise<ReminderListResult>;
  getTodayReminders: (staffId: string) => Promise<ILeadReminderDocument[]>;
  getOverdueReminders: (staffId: string) => Promise<ILeadReminderDocument[]>;
  completeReminder: (id: string) => Promise<ILeadReminderDocument>;
  snoozeReminder: (id: string, newDate: string, newTime: string) => Promise<ILeadReminderDocument>;
}

export function createLeadReminderService(deps: LeadReminderServiceDeps): LeadReminderServiceResult {
  const { LeadModel, LeadReminderModel } = deps;

  async function createReminder(data: Partial<ILeadReminderDocument>): Promise<ILeadReminderDocument> {
    if (!data.leadId) throw AppError.badRequest('Lead ID is required');

    const lead = await LeadModel.findById(data.leadId);
    if (!lead) throw AppError.notFound('Lead');

    const reminder = await LeadReminderModel.create({
      ...data,
      isCompleted: false,
      isOverdue: false,
      isSnoozed: false,
      notificationSent: false,
    });

    return reminder;
  }

  async function getReminders(
    leadId: string,
    scopeFilter?: Record<string, unknown>,
  ): Promise<ReminderListResult> {
    // Verify lead access
    const leadFilter: FilterQuery<ILeadDocument> = { _id: leadId };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(leadFilter, scopeFilter);
    }
    const lead = await LeadModel.findOne(leadFilter);
    if (!lead) throw AppError.notFound('Lead');

    const reminders = await LeadReminderModel.find({ leadId })
      .populate('assignedTo', 'firstName lastName')
      .sort({ reminderDate: 1, reminderTime: 1 })
      .lean<ILeadReminderDocument[]>();

    return {
      reminders,
      total: reminders.length,
    };
  }

  async function getTodayReminders(staffId: string): Promise<ILeadReminderDocument[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    return LeadReminderModel.find({
      assignedTo: staffId,
      reminderDate: { $gte: todayStart, $lte: todayEnd },
      isCompleted: false,
    })
      .populate('leadId', 'leadNumber firstName lastName mobile status priority')
      .sort({ reminderTime: 1 })
      .lean<ILeadReminderDocument[]>();
  }

  async function getOverdueReminders(staffId: string): Promise<ILeadReminderDocument[]> {
    return LeadReminderModel.find({
      assignedTo: staffId,
      isOverdue: true,
      isCompleted: false,
    })
      .populate('leadId', 'leadNumber firstName lastName mobile status priority')
      .sort({ reminderDate: 1 })
      .lean<ILeadReminderDocument[]>();
  }

  async function completeReminder(id: string): Promise<ILeadReminderDocument> {
    const reminder = await LeadReminderModel.findByIdAndUpdate(
      id,
      {
        isCompleted: true,
        completedAt: new Date(),
        isOverdue: false,
      },
      { new: true },
    );
    if (!reminder) throw AppError.notFound('Reminder');
    return reminder;
  }

  async function snoozeReminder(
    id: string,
    newDate: string,
    newTime: string,
  ): Promise<ILeadReminderDocument> {
    const reminder = await LeadReminderModel.findByIdAndUpdate(
      id,
      {
        isSnoozed: true,
        snoozedUntil: new Date(newDate),
        reminderDate: new Date(newDate),
        reminderTime: newTime,
        isOverdue: false,
      },
      { new: true },
    );
    if (!reminder) throw AppError.notFound('Reminder');
    return reminder;
  }

  return {
    createReminder,
    getReminders,
    getTodayReminders,
    getOverdueReminders,
    completeReminder,
    snoozeReminder,
  };
}
