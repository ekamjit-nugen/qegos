import { Schema, type Connection, type Model } from 'mongoose';
import type { IBroadcastMessageDocument } from '../types';

const broadcastMessageSchema = new Schema<IBroadcastMessageDocument>(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: 'BroadcastCampaign', required: true },
    recipientId: { type: Schema.Types.ObjectId },
    recipientType: {
      type: String,
      required: true,
      enum: ['lead', 'user', 'custom'],
    },
    recipientMobile: { type: String },
    recipientEmail: { type: String },
    channel: {
      type: String,
      required: true,
      enum: ['sms', 'email', 'whatsapp'],
    },
    status: {
      type: String,
      required: true,
      enum: ['queued', 'sending', 'sent', 'delivered', 'failed', 'bounced', 'opened', 'clicked', 'opted_out'],
      default: 'queued',
    },
    gatewayId: { type: String },
    error: { type: String },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    openedAt: { type: Date },
    clickedAt: { type: Date },
    abVariant: { type: String },
    // Per-recipient merge values frozen at queue-creation time so
    // {{firstName}} etc. render with the actual recipient's data.
    mergeData: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'broadcast_messages',
  },
);

// Indexes
broadcastMessageSchema.index({ campaignId: 1, status: 1 });
broadcastMessageSchema.index({ recipientId: 1, channel: 1 });
broadcastMessageSchema.index({ gatewayId: 1 }, { unique: true, sparse: true });
broadcastMessageSchema.index({ status: 1, createdAt: 1 }); // for queue processing
broadcastMessageSchema.index({ recipientEmail: 1, status: 1 }); // soft bounce lookup
broadcastMessageSchema.index({ recipientMobile: 1, status: 1 }); // soft bounce lookup

export function createMessageModel(connection: Connection): Model<IBroadcastMessageDocument> {
  if (connection.models.BroadcastMessage) {
    return connection.models.BroadcastMessage as Model<IBroadcastMessageDocument>;
  }
  return connection.model<IBroadcastMessageDocument>('BroadcastMessage', broadcastMessageSchema);
}
