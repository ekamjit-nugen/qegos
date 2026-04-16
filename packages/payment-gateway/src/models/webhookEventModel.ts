import { Schema, type Model, type Connection } from 'mongoose';
import type { IWebhookEventDocument, PaymentGateway, WebhookEventStatus } from '../types';

const webhookEventSchema = new Schema<IWebhookEventDocument>(
  {
    // PAY-INV-03: Unique eventId for exactly-once processing
    eventId: {
      type: String,
      required: [true, 'Event ID is required'],
      unique: true,
      index: true,
    },
    gateway: {
      type: String,
      required: true,
      enum: ['stripe', 'payzoo'] as PaymentGateway[],
    },
    eventType: {
      type: String,
      required: [true, 'Event type is required'],
      trim: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: [true, 'Payload is required'],
    },
    processedAt: { type: Date },
    status: {
      type: String,
      required: true,
      enum: ['received', 'processing', 'processed', 'failed', 'ignored'] as WebhookEventStatus[],
      default: 'received',
    },
    error: { type: String },
    retryCount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Index for cleanup/archival queries
webhookEventSchema.index({ createdAt: 1 });
webhookEventSchema.index({ gateway: 1, status: 1 });

/**
 * Factory function to create the WebhookEvent model.
 */
export function createWebhookEventModel(connection: Connection): Model<IWebhookEventDocument> {
  return connection.model<IWebhookEventDocument>('WebhookEvent', webhookEventSchema);
}
