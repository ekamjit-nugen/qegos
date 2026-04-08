import { Schema, type Connection, type Model } from 'mongoose';
import type { IXeroSyncLogDocument } from '../types';
import { XERO_SYNC_ENTITY_TYPES, XERO_SYNC_ACTIONS, XERO_SYNC_STATUSES } from '../types';

const xeroSyncLogSchema = new Schema<IXeroSyncLogDocument>(
  {
    entityType: {
      type: String,
      required: true,
      enum: XERO_SYNC_ENTITY_TYPES,
    },
    entityId: { type: Schema.Types.ObjectId, required: true },
    xeroEntityId: { type: String },
    action: {
      type: String,
      required: true,
      enum: XERO_SYNC_ACTIONS,
    },
    status: {
      type: String,
      required: true,
      enum: XERO_SYNC_STATUSES,
      default: 'queued',
    },
    requestPayload: { type: Schema.Types.Mixed, default: {} },
    responsePayload: { type: Schema.Types.Mixed },
    error: { type: String },
    retryCount: { type: Number, default: 0 },
    nextRetryAt: { type: Date },
    processedAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'xero_sync_logs',
  },
);

// Indexes
xeroSyncLogSchema.index({ entityType: 1, entityId: 1 });
xeroSyncLogSchema.index({ status: 1, nextRetryAt: 1 });
xeroSyncLogSchema.index({ createdAt: -1 });

export function createXeroSyncLogModel(connection: Connection): Model<IXeroSyncLogDocument> {
  if (connection.models.XeroSyncLog) {
    return connection.models.XeroSyncLog as Model<IXeroSyncLogDocument>;
  }
  return connection.model<IXeroSyncLogDocument>('XeroSyncLog', xeroSyncLogSchema);
}
