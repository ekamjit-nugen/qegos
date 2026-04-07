import { Schema, type Model, type Connection } from 'mongoose';
import type { ILeadReminderDocument } from './lead.types';

const leadReminderSchema = new Schema<ILeadReminderDocument>(
  {
    leadId: {
      type: Schema.Types.ObjectId,
      ref: 'Lead',
      required: [true, 'Lead ID is required'],
      index: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Assigned to is required'],
    },
    reminderDate: {
      type: Date,
      required: [true, 'Reminder date is required'],
    },
    reminderTime: {
      type: String,
      required: [true, 'Reminder time is required'],
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Reminder time must be in HH:mm format'],
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    description: { type: String, trim: true },
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date },
    isOverdue: { type: Boolean, default: false },
    isSnoozed: { type: Boolean, default: false },
    snoozedUntil: { type: Date },
    notificationSent: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// ─── Indexes ────────────────────────────────────────────────────────────────

leadReminderSchema.index({ assignedTo: 1, reminderDate: 1 });
leadReminderSchema.index({ isCompleted: 1, isOverdue: 1 });

/**
 * Factory function to create the LeadReminder model.
 */
export function createLeadReminderModel(connection: Connection): Model<ILeadReminderDocument> {
  return connection.model<ILeadReminderDocument>('LeadReminder', leadReminderSchema);
}
