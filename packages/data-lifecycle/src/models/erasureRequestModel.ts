import { Schema, type Connection, type Model } from 'mongoose';
import type { IErasureRequestDocument, ErasureRequestStatus } from '../types';
import { ERASURE_REQUEST_STATUSES } from '../types';

const erasureRequestSchema = new Schema<IErasureRequestDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    requestedBy: { type: Schema.Types.ObjectId, required: true },
    status: {
      type: String,
      required: true,
      enum: ERASURE_REQUEST_STATUSES,
      default: 'pending' as ErasureRequestStatus,
    },
    reason: { type: String, maxlength: 2000 },
    rejectionReason: { type: String, maxlength: 2000 },
    approvedBy: { type: Schema.Types.ObjectId },
    approvedAt: { type: Date },
    executedAt: { type: Date },
    modelsProcessed: [{ type: String }],
    recordsAnonymized: { type: Number, default: 0 },
    recordsDeleted: { type: Number, default: 0 },
    failureReason: { type: String },
  },
  {
    timestamps: true,
    collection: 'erasure_requests',
  },
);

erasureRequestSchema.index({ status: 1, createdAt: -1 });

export function createErasureRequestModel(connection: Connection): Model<IErasureRequestDocument> {
  if (connection.models.ErasureRequest) {
    return connection.models.ErasureRequest as Model<IErasureRequestDocument>;
  }
  return connection.model<IErasureRequestDocument>('ErasureRequest', erasureRequestSchema);
}
