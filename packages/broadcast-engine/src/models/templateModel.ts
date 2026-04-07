import { Schema, type Connection, type Model } from 'mongoose';
import type { IBroadcastTemplateDocument } from '../types';

const broadcastTemplateSchema = new Schema<IBroadcastTemplateDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    channel: {
      type: String,
      required: true,
      enum: ['sms', 'email', 'whatsapp'],
    },
    category: {
      type: String,
      required: true,
      enum: [
        'follow_up', 'promotion', 'reminder', 'announcement',
        'welcome', 're_engagement', 'deadline', 'review_request',
      ],
    },
    subject: { type: String, trim: true, maxlength: 500 },
    body: { type: String, required: true, maxlength: 10000 },
    isActive: { type: Boolean, default: true },
    usageCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    collection: 'broadcast_templates',
  },
);

// Indexes
broadcastTemplateSchema.index({ channel: 1, category: 1 });
broadcastTemplateSchema.index({ isActive: 1, usageCount: -1 });

export function createTemplateModel(connection: Connection): Model<IBroadcastTemplateDocument> {
  if (connection.models.BroadcastTemplate) {
    return connection.models.BroadcastTemplate as Model<IBroadcastTemplateDocument>;
  }
  return connection.model<IBroadcastTemplateDocument>('BroadcastTemplate', broadcastTemplateSchema);
}
