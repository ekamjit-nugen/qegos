import { Schema, type Model, type Connection } from 'mongoose';
import type { ILeadActivityDocument } from './lead.types';
import {
  ACTIVITY_TYPES,
  ACTIVITY_OUTCOMES,
  SENTIMENTS,
  CALL_DIRECTIONS,
} from './lead.types';

const leadActivitySchema = new Schema<ILeadActivityDocument>(
  {
    leadId: {
      type: Schema.Types.ObjectId,
      ref: 'Lead',
      required: [true, 'Lead ID is required'],
      index: true,
    },
    type: {
      type: String,
      required: [true, 'Activity type is required'],
      enum: {
        values: ACTIVITY_TYPES,
        message: 'Invalid activity type: {VALUE}',
      },
    },
    subject: { type: String, trim: true },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    outcome: {
      type: String,
      enum: {
        values: ACTIVITY_OUTCOMES,
        message: 'Invalid outcome: {VALUE}',
      },
    },
    sentiment: {
      type: String,
      enum: SENTIMENTS,
    },
    callDuration: { type: Number, min: 0 },
    callDirection: {
      type: String,
      enum: CALL_DIRECTIONS,
    },
    nextAction: { type: String },
    nextActionDate: { type: Date },
    quotedAmount: {
      type: Number,
      validate: {
        validator: function (v: number): boolean {
          return Number.isInteger(v);
        },
        message: 'quotedAmount must be an integer (cents)',
      },
    },
    servicesQuoted: [{ type: Schema.Types.ObjectId, ref: 'Sales' }],
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Performed by is required'],
    },
    attachments: [
      {
        fileName: { type: String, required: true },
        fileUrl: { type: String, required: true },
        fileType: { type: String, required: true },
        fileSize: { type: Number, required: true },
      },
    ],
    isSystemGenerated: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// ─── Indexes ────────────────────────────────────────────────────────────────

leadActivitySchema.index({ leadId: 1, createdAt: -1 });

/**
 * Factory function to create the LeadActivity model.
 */
export function createLeadActivityModel(connection: Connection): Model<ILeadActivityDocument> {
  return connection.model<ILeadActivityDocument>('LeadActivity', leadActivitySchema);
}
