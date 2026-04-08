import { Schema, type Connection, type Model } from 'mongoose';
import type { INotificationDocument } from '../types';
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
  RECIPIENT_TYPES,
  DEFAULT_RETENTION_DAYS,
} from '../types';

const channelResultSchema = new Schema(
  {
    sent: { type: Boolean, default: false },
    sentAt: { type: Date },
    error: { type: String },
    gatewayId: { type: String },
  },
  { _id: false },
);

const notificationSchema = new Schema<INotificationDocument>(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipientType: {
      type: String,
      enum: RECIPIENT_TYPES,
      required: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 200,
    },
    body: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    channels: [
      {
        type: String,
        enum: NOTIFICATION_CHANNELS,
      },
    ],
    channelResults: {
      push: { type: channelResultSchema },
      sms: { type: channelResultSchema },
      email: { type: channelResultSchema },
      in_app: { type: channelResultSchema },
      slack: { type: channelResultSchema },
    },
    data: {
      type: Schema.Types.Mixed,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
    relatedResource: {
      type: String,
    },
    relatedResourceId: {
      type: Schema.Types.ObjectId,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// Indexes for query performance
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, isRead: 1 });
notificationSchema.index({ type: 1, relatedResourceId: 1 });

// TTL index for automatic cleanup (90 days by default)
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: DEFAULT_RETENTION_DAYS * 24 * 60 * 60 },
);

export function createNotificationModel(
  connection: Connection,
): Model<INotificationDocument> {
  return connection.model<INotificationDocument>('Notification', notificationSchema);
}
