import { Schema, type Connection, type Model } from 'mongoose';
import type { ITaxDeadlineDocument, IDeadlineReminderDocument } from './taxCalendar.types';
import { DEADLINE_TYPES, APPLICABLE_TO_VALUES } from './taxCalendar.types';

// ─── Tax Deadline Schema ───────────────────────────────────────────────────

const reminderScheduleSchema = new Schema(
  {
    daysBefore: { type: Number, required: true },
    channel: { type: String, required: true, enum: ['email', 'push', 'sms', 'sms_push'] },
  },
  { _id: false },
);

const taxDeadlineSchema = new Schema<ITaxDeadlineDocument>(
  {
    title: { type: String, required: true },
    description: { type: String },
    deadlineDate: { type: Date, required: true },
    type: {
      type: String,
      required: true,
      enum: DEADLINE_TYPES,
    },
    applicableTo: {
      type: String,
      required: true,
      enum: APPLICABLE_TO_VALUES,
      default: 'all_clients',
    },
    reminderSchedule: [reminderScheduleSchema],
    financialYear: { type: String, required: true },
    isRecurring: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    notificationsSent: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'tax_deadlines',
  },
);

// Indexes
taxDeadlineSchema.index({ financialYear: 1, type: 1 });
taxDeadlineSchema.index({ deadlineDate: 1, isActive: 1 });
taxDeadlineSchema.index({ applicableTo: 1 });

export function createTaxDeadlineModel(connection: Connection): Model<ITaxDeadlineDocument> {
  if (connection.models.TaxDeadline) {
    return connection.models.TaxDeadline as Model<ITaxDeadlineDocument>;
  }
  return connection.model<ITaxDeadlineDocument>('TaxDeadline', taxDeadlineSchema);
}

// ─── Deadline Reminder Schema (dedup tracking — CAL-INV-03) ────────────────

const deadlineReminderSchema = new Schema<IDeadlineReminderDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deadlineId: { type: Schema.Types.ObjectId, ref: 'TaxDeadline', required: true },
    daysBefore: { type: Number, required: true },
    channel: { type: String, required: true, enum: ['email', 'push', 'sms', 'sms_push'] },
    sentAt: { type: Date, default: Date.now },
  },
  {
    collection: 'deadline_reminders',
  },
);

// CAL-INV-03: Max 1 reminder per {userId, deadlineId, daysBefore}
deadlineReminderSchema.index(
  { userId: 1, deadlineId: 1, daysBefore: 1 },
  { unique: true },
);

export function createDeadlineReminderModel(connection: Connection): Model<IDeadlineReminderDocument> {
  if (connection.models.DeadlineReminder) {
    return connection.models.DeadlineReminder as Model<IDeadlineReminderDocument>;
  }
  return connection.model<IDeadlineReminderDocument>('DeadlineReminder', deadlineReminderSchema);
}
