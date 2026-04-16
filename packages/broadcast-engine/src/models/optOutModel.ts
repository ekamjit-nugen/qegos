import { Schema, type Connection, type Model } from 'mongoose';
import type { IOptOutDocument } from '../types';

const optOutSchema = new Schema<IOptOutDocument>(
  {
    contact: { type: String, required: true, trim: true },
    contactType: {
      type: String,
      required: true,
      enum: ['mobile', 'email'],
    },
    channel: {
      type: String,
      required: true,
      enum: ['sms', 'email', 'whatsapp', 'all'],
    },
    reason: {
      type: String,
      required: true,
      enum: [
        'user_request',
        'reply_stop',
        'bounce_hard',
        'bounce_soft_3x',
        'admin_manual',
        'spam_complaint',
      ],
    },
    campaignId: { type: Schema.Types.ObjectId, ref: 'BroadcastCampaign' },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'broadcast_optouts',
  },
);

// Unique compound: one opt-out per contact per channel
optOutSchema.index({ contact: 1, channel: 1 }, { unique: true });
optOutSchema.index({ contactType: 1 });

export function createOptOutModel(connection: Connection): Model<IOptOutDocument> {
  if (connection.models.BroadcastOptOut) {
    return connection.models.BroadcastOptOut as Model<IOptOutDocument>;
  }
  return connection.model<IOptOutDocument>('BroadcastOptOut', optOutSchema);
}
