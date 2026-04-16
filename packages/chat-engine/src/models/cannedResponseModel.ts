import { Schema, type Connection, type Model } from 'mongoose';
import type { ICannedResponseDocument } from '../types';
import { CANNED_RESPONSE_CATEGORIES } from '../types';

const cannedResponseSchema = new Schema<ICannedResponseDocument>(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    category: {
      type: String,
      required: true,
      enum: CANNED_RESPONSE_CATEGORIES,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isGlobal: { type: Boolean, default: false },
    usageCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'canned_responses',
  },
);

// ─── Indexes ────────────────────────────────────────────────────────────────

cannedResponseSchema.index({ category: 1, isGlobal: 1 });
cannedResponseSchema.index({ createdBy: 1 });

// ─── Factory ────────────────────────────────────────────────────────────────

export function createCannedResponseModel(connection: Connection): Model<ICannedResponseDocument> {
  if (connection.models.CannedResponse) {
    return connection.models.CannedResponse as Model<ICannedResponseDocument>;
  }
  return connection.model<ICannedResponseDocument>('CannedResponse', cannedResponseSchema);
}
