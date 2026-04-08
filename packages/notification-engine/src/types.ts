import type { Document, Types, Model } from 'mongoose';
import type { RequestHandler } from 'express';

// ─── Notification Type Enum ─────────────────────────────────────────────────

export type NotificationType =
  | 'order_status'
  | 'payment_received'
  | 'payment_failed'
  | 'document_signed'
  | 'lead_assigned'
  | 'lead_reminder'
  | 'follow_up_due'
  | 'follow_up_overdue'
  | 'broadcast_delivery'
  | 'chat_message'
  | 'review_request'
  | 'review_submitted'
  | 'referral_reward'
  | 'deadline_reminder'
  | 'cra_status_update'
  | 'system_alert';

export const NOTIFICATION_TYPES: NotificationType[] = [
  'order_status',
  'payment_received',
  'payment_failed',
  'document_signed',
  'lead_assigned',
  'lead_reminder',
  'follow_up_due',
  'follow_up_overdue',
  'broadcast_delivery',
  'chat_message',
  'review_request',
  'review_submitted',
  'referral_reward',
  'deadline_reminder',
  'cra_status_update',
  'system_alert',
];

// ─── Channel Enum ───────────────────────────────────────────────────────────

export type NotificationChannel = 'push' | 'sms' | 'email' | 'in_app' | 'slack';

export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  'push',
  'sms',
  'email',
  'in_app',
  'slack',
];

// ─── Recipient Type ─────────────────────────────────────────────────────────

export type RecipientType = 'client' | 'staff' | 'admin';

export const RECIPIENT_TYPES: RecipientType[] = ['client', 'staff', 'admin'];

// ─── Preference Language ────────────────────────────────────────────────────

export type PreferenceLanguage = 'en' | 'zh' | 'hi' | 'pa' | 'vi' | 'ar';

export const PREFERENCE_LANGUAGES: PreferenceLanguage[] = ['en', 'zh', 'hi', 'pa', 'vi', 'ar'];

// ─── Constants ──────────────────────────────────────────────────────────────

/** NTF-INV-02: Email and in_app are exempt from quiet hours */
export const QUIET_HOURS_EXEMPT_CHANNELS: NotificationChannel[] = ['email', 'in_app'];

/** NTF-INV-05: Dedup window in seconds */
export const DEDUP_TTL_SECONDS = 300;

/** Default quiet hours start (user-local time) */
export const DEFAULT_QUIET_START = '21:00';

/** Default quiet hours end (user-local time) */
export const DEFAULT_QUIET_END = '08:00';

/** Default timezone for notifications */
export const DEFAULT_TIMEZONE = 'Australia/Sydney';

/** Default notification retention in days (TTL index) */
export const DEFAULT_RETENTION_DAYS = 90;

// ─── Merge Tag Fallbacks (NTF-INV-04) ───────────────────────────────────────

export const MERGE_TAG_FALLBACKS: Record<string, string> = {
  firstName: 'Valued Client',
  lastName: '',
  leadNumber: '',
  orderNumber: '',
  serviceName: '',
  financialYear: '',
  deadlineDate: '',
  staffName: '',
  companyName: 'QEGOS',
  amount: '',
};

// ─── Channel Result ─────────────────────────────────────────────────────────

export interface ChannelResult {
  sent: boolean;
  sentAt?: Date;
  error?: string;
  gatewayId?: string;
}

// ─── Notification Document ──────────────────────────────────────────────────

export interface INotification {
  recipientId: Types.ObjectId;
  recipientType: RecipientType;
  type: NotificationType;
  title: string;
  body: string;
  channels: NotificationChannel[];
  channelResults: Partial<Record<NotificationChannel, ChannelResult>>;
  data?: Record<string, unknown>;
  isRead: boolean;
  readAt?: Date;
  relatedResource?: string;
  relatedResourceId?: Types.ObjectId;
  createdAt: Date;
}

export interface INotificationDocument extends INotification, Document {
  _id: Types.ObjectId;
}

// ─── Notification Preference Document ───────────────────────────────────────

export interface ChannelPreferences {
  push: boolean;
  sms: boolean;
  email: boolean;
  in_app: boolean;
}

export interface INotificationPreference {
  userId: Types.ObjectId;
  preferences: Record<string, ChannelPreferences>;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string;
  language: PreferenceLanguage;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationPreferenceDocument extends INotificationPreference, Document {
  _id: Types.ObjectId;
}

// ─── Channel Provider Interface ─────────────────────────────────────────────

export interface NotificationChannelContent {
  to: string;
  title: string;
  body: string;
  subject?: string;
  htmlBody?: string;
  data?: Record<string, unknown>;
}

export interface NotificationSendResult {
  success: boolean;
  gatewayId?: string;
  error?: string;
}

export interface INotificationChannelProvider {
  channel: NotificationChannel;
  send(content: NotificationChannelContent): Promise<NotificationSendResult>;
}

// ─── Send Parameters ────────────────────────────────────────────────────────

export interface SendNotificationParams {
  recipientId: string;
  recipientType: RecipientType;
  type: NotificationType;
  title: string;
  body: string;
  channels: NotificationChannel[];
  mergeData?: Record<string, string>;
  data?: Record<string, unknown>;
  relatedResource?: string;
  relatedResourceId?: string;
}

// ─── Send Result ────────────────────────────────────────────────────────────

export interface SendNotificationResult {
  notification: INotificationDocument;
  skipped?: boolean;
  reason?: string;
  quietHoursDelays?: Array<{
    channel: NotificationChannel;
    delayMs: number;
  }>;
}

// ─── Engine Config ──────────────────────────────────────────────────────────

export interface NotificationEngineConfig {
  // Firebase Cloud Messaging
  firebaseServiceAccountJson?: string;

  // Slack
  slackWebhookUrl?: string;

  // Twilio SMS
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;

  // Amazon SES Email
  sesRegion?: string;
  sesAccessKeyId?: string;
  sesSecretAccessKey?: string;
  sesFromEmail?: string;

  // Defaults
  defaultTimezone?: string;
  notificationRetentionDays?: number;
}

// ─── Init Result ────────────────────────────────────────────────────────────

export interface NotificationEngineInitResult {
  NotificationModel: Model<INotificationDocument>;
  NotificationPreferenceModel: Model<INotificationPreferenceDocument>;
  providers: Map<NotificationChannel, INotificationChannelProvider>;
}

// ─── Route Dependencies ─────────────────────────────────────────────────────

export interface NotificationRouteDeps {
  NotificationModel: Model<INotificationDocument>;
  NotificationPreferenceModel: Model<INotificationPreferenceDocument>;
  UserModel: Model<Document>;
  authenticate: () => RequestHandler;
  checkPermission: (resource: string, action: string) => RequestHandler;
  auditLog?: {
    log: (entry: Record<string, unknown>) => Promise<void>;
    logFromRequest?: (req: unknown, entry: Record<string, unknown>) => Promise<void>;
  };
  providers: Map<NotificationChannel, INotificationChannelProvider>;
  redisClient: unknown;
  config: NotificationEngineConfig;
}
