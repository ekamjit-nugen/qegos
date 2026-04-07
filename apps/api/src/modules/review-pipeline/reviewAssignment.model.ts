import { Schema, type Model, type Connection } from 'mongoose';
import type { IReviewAssignmentDocument } from './review.types';
import { REVIEW_STATUSES } from './review.types';

const changeRequestSchema = new Schema(
  {
    field: { type: String, required: true },
    issue: { type: String, required: true },
    instruction: { type: String, required: true },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
  },
  { _id: true },
);

const checklistItemSchema = new Schema(
  {
    item: { type: String, required: true },
    checked: { type: Boolean, default: false },
    note: { type: String },
  },
  { _id: false },
);

const reviewAssignmentSchema = new Schema<IReviewAssignmentDocument>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order ID is required'],
      unique: true, // One active review per order
    },
    preparerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Preparer ID is required'],
    },
    reviewerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Reviewer ID is required'],
    },
    status: {
      type: String,
      required: true,
      enum: {
        values: REVIEW_STATUSES,
        message: 'Invalid review status: {VALUE}',
      },
      default: 'pending_review',
    },
    checklist: [checklistItemSchema],
    reviewNotes: { type: String },
    changesRequested: [changeRequestSchema],
    changesResolvedCount: { type: Number, default: 0 },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
    rejectedReason: { type: String },
    reviewRound: { type: Number, default: 1 },
    timeToReview: { type: Number }, // minutes
  },
  { timestamps: true },
);

// ─── Indexes ────────────────────────────────────────────────────────────────

reviewAssignmentSchema.index({ reviewerId: 1, status: 1 });
reviewAssignmentSchema.index({ preparerId: 1 });

/**
 * Factory function to create the ReviewAssignment model.
 */
export function createReviewAssignmentModel(connection: Connection): Model<IReviewAssignmentDocument> {
  return connection.model<IReviewAssignmentDocument>('ReviewAssignment', reviewAssignmentSchema);
}
