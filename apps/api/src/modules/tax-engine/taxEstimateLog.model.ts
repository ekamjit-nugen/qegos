import { Schema, type Model, type Connection } from 'mongoose';
import type { ITaxEstimateLogDocument } from './taxEngine.types';
import { ESTIMATE_CONTEXTS } from './taxEngine.types';

const taxEstimateLogSchema = new Schema<ITaxEstimateLogDocument>(
  {
    estimateNumber: {
      type: String,
      unique: true,
      required: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    financialYear: { type: String, required: true, trim: true },
    rulesSnapshotId: {
      type: String,
      required: true,
      immutable: true, // VER-INV-02
    },
    rulesVersion: { type: Number, required: true },
    input: { type: Schema.Types.Mixed, required: true },
    output: { type: Schema.Types.Mixed, required: true },
    context: {
      type: String,
      required: true,
      enum: [...ESTIMATE_CONTEXTS],
    },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    expiresAt: { type: Date, required: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

// ─── Indexes ───────────────────────────────────────────────────────────────

taxEstimateLogSchema.index({ userId: 1, financialYear: 1, createdAt: -1 });
taxEstimateLogSchema.index({ leadId: 1 });
taxEstimateLogSchema.index({ orderId: 1 });
taxEstimateLogSchema.index({ rulesSnapshotId: 1 });
taxEstimateLogSchema.index({ estimateNumber: 1 }, { unique: true });
taxEstimateLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ─── Soft-Delete Query Middleware ──────────────────────────────────────────

taxEstimateLogSchema.pre('find', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

taxEstimateLogSchema.pre('findOne', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

taxEstimateLogSchema.pre('countDocuments', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

// ─── Factory ───────────────────────────────────────────────────────────────

/**
 * Factory function to create the TaxEstimateLog model.
 */
export function createTaxEstimateLogModel(connection: Connection): Model<ITaxEstimateLogDocument> {
  if (connection.models['TaxEstimateLog']) {
    return connection.models['TaxEstimateLog'] as Model<ITaxEstimateLogDocument>;
  }
  return connection.model<ITaxEstimateLogDocument>('TaxEstimateLog', taxEstimateLogSchema);
}
