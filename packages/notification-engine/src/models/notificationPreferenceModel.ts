import { Schema, type Connection, type Model } from 'mongoose';
import type { INotificationPreferenceDocument } from '../types';
import { PREFERENCE_LANGUAGES } from '../types';

const channelPrefsSchema = new Schema(
  {
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    in_app: { type: Boolean, default: true },
  },
  { _id: false },
);

const notificationPreferenceSchema = new Schema<INotificationPreferenceDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    preferences: {
      type: Map,
      of: channelPrefsSchema,
      default: {},
    },
    quietHoursEnabled: {
      type: Boolean,
      default: false,
    },
    quietHoursStart: {
      type: String,
      default: '21:00',
      match: /^\d{2}:\d{2}$/,
    },
    quietHoursEnd: {
      type: String,
      default: '08:00',
      match: /^\d{2}:\d{2}$/,
    },
    timezone: {
      type: String,
      default: 'Australia/Sydney',
    },
    language: {
      type: String,
      enum: PREFERENCE_LANGUAGES,
      default: 'en',
    },
  },
  {
    timestamps: true,
  },
);

notificationPreferenceSchema.index({ userId: 1 }, { unique: true });

export function createNotificationPreferenceModel(
  connection: Connection,
): Model<INotificationPreferenceDocument> {
  return connection.model<INotificationPreferenceDocument>(
    'NotificationPreference',
    notificationPreferenceSchema,
  );
}
