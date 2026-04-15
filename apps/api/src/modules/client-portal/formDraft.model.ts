/**
 * Form Draft Model
 *
 * Stores partial form submissions so clients can save progress
 * and resume later. Each client can have at most one draft per
 * (mappingId + financialYear) combination.
 */

import { Schema, type Model, type Connection, type Types, type Document } from 'mongoose';

// ─── Interface ────────────────────────────────────────────────────────────

export interface IFormDraft {
  userId: Types.ObjectId;
  mappingId: Types.ObjectId;
  versionNumber: number;
  financialYear: string;
  /** Current stepper step (0-based) */
  currentStep: number;
  /** Partial form answers */
  answers: Record<string, unknown>;
  /** Personal details captured so far */
  personalDetails: {
    firstName?: string;
    lastName?: string;
    email?: string;
    mobile?: string;
    dateOfBirth?: string;
  };
  /** Metadata for UI display */
  serviceTitle: string;
  servicePrice: number;
  formTitle: string;
  /** Soft delete */
  isDeleted: boolean;
  /** Timestamps */
  createdAt: Date;
  updatedAt: Date;
}

export interface IFormDraftDocument extends IFormDraft, Document {}

// ─── Schema ───────────────────────────────────────────────────────────────

const formDraftSchema = new Schema<IFormDraftDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    mappingId: { type: Schema.Types.ObjectId, required: true, ref: 'FormMapping' },
    versionNumber: { type: Number, required: true, min: 1 },
    financialYear: { type: String, required: true },
    currentStep: { type: Number, required: true, default: 0, min: 0 },
    answers: { type: Schema.Types.Mixed, default: {} },
    personalDetails: {
      firstName: { type: String },
      lastName: { type: String },
      email: { type: String },
      mobile: { type: String },
      dateOfBirth: { type: String },
    },
    serviceTitle: { type: String, required: true },
    servicePrice: { type: Number, required: true },
    formTitle: { type: String, required: true },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: 'form_drafts',
  },
);

// One draft per user per mapping+FY combination
formDraftSchema.index(
  { userId: 1, mappingId: 1, financialYear: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);

// TTL: auto-delete drafts older than 90 days
formDraftSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// ─── Factory ──────────────────────────────────────────────────────────────

export function createFormDraftModel(connection: Connection): Model<IFormDraftDocument> {
  return connection.model<IFormDraftDocument>('FormDraft', formDraftSchema);
}
