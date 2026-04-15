import type { Model } from 'mongoose';
import type {
  INotificationDocument,
  INotificationPreferenceDocument,
  NotificationChannel,
  NotificationEngineConfig,
  INotificationChannelProvider,
  SendNotificationParams,
  SendNotificationResult,
  ChannelResult,
} from '../types';
import { QUIET_HOURS_EXEMPT_CHANNELS, DEDUP_TTL_SECONDS } from '../types';
import { renderMergeTags } from './templateService';
import { isChannelEnabled, getQuietHoursConfig } from './preferenceService';

// ─── Module State ───────────────────────────────────────────────────────────

let NotificationModel: Model<INotificationDocument>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let redisClient: any;
let providers: Map<NotificationChannel, INotificationChannelProvider>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Model<T> invariant; `any` at DI boundary.
let UserModel: Model<any>;

export function initNotificationService(
  notificationModel: Model<INotificationDocument>,
  _preferenceModel: Model<INotificationPreferenceDocument>,
  redis: unknown,
  providerMap: Map<NotificationChannel, INotificationChannelProvider>,
  _config: NotificationEngineConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  externalModels: { UserModel: Model<any> },
): void {
  NotificationModel = notificationModel;
  redisClient = redis;
  providers = providerMap;
  UserModel = externalModels.UserModel;
}

// ─── Quiet Hours Calculation ────────────────────────────────────────────────

/**
 * NTF-INV-02: Calculate delay in ms until quiet hours end.
 * Returns 0 if not currently in quiet hours.
 * Uses Intl.DateTimeFormat for timezone conversion (no external libs).
 */
export function calculateQuietHoursDelay(
  timezone: string,
  quietStart: string,
  quietEnd: string,
): number {
  // Get current time in the user's timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const hourPart = parts.find((p) => p.type === 'hour');
  const minutePart = parts.find((p) => p.type === 'minute');

  if (!hourPart || !minutePart) return 0;

  const currentHour = parseInt(hourPart.value, 10);
  const currentMinute = parseInt(minutePart.value, 10);
  const currentMinutes = currentHour * 60 + currentMinute;

  const [startH, startM] = quietStart.split(':').map(Number);
  const [endH, endM] = quietEnd.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  let inQuietHours = false;

  if (startMinutes > endMinutes) {
    // Overnight span (e.g., 21:00 to 08:00)
    inQuietHours = currentMinutes >= startMinutes || currentMinutes < endMinutes;
  } else {
    // Same-day span (e.g., 01:00 to 06:00)
    inQuietHours = currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  if (!inQuietHours) return 0;

  // Calculate delay until quiet hours end
  let delayMinutes: number;
  if (currentMinutes >= endMinutes) {
    // End is tomorrow
    delayMinutes = (24 * 60 - currentMinutes) + endMinutes;
  } else {
    delayMinutes = endMinutes - currentMinutes;
  }

  return delayMinutes * 60 * 1000;
}

// ─── Deduplication ──────────────────────────────────────────────────────────

/**
 * NTF-INV-05: Build dedup key for Redis.
 */
export function buildDedupKey(
  type: string,
  recipientId: string,
  relatedResourceId?: string,
): string {
  return `ntf:dedup:${type}:${recipientId}:${relatedResourceId ?? 'none'}`;
}

// ─── Core Send Function ─────────────────────────────────────────────────────

/**
 * Send a notification across requested channels.
 * Enforces all NTF invariants: dedup, preferences, quiet hours, FCM token cleanup.
 */
export async function send(
  params: SendNotificationParams,
): Promise<SendNotificationResult> {
  // NTF-INV-05: Dedup check (skip if no relatedResourceId)
  if (params.relatedResourceId && redisClient) {
    const dedupKey = buildDedupKey(params.type, params.recipientId, params.relatedResourceId);
    const wasSet = await redisClient.set(dedupKey, '1', 'NX', 'EX', DEDUP_TTL_SECONDS);
    if (!wasSet) {
      // Create a minimal notification record for tracking
      const notification = await NotificationModel.create({
        recipientId: params.recipientId,
        recipientType: params.recipientType,
        type: params.type,
        title: params.title,
        body: params.body,
        channels: params.channels,
        channelResults: {},
        data: params.data,
        relatedResource: params.relatedResource,
        relatedResourceId: params.relatedResourceId,
        isRead: true, // Mark deduped notifications as read
      });
      return { notification, skipped: true, reason: 'duplicate' };
    }
  }

  // NTF-INV-04: Render merge tags
  const renderedTitle = params.mergeData
    ? renderMergeTags(params.title, params.mergeData)
    : params.title;
  const renderedBody = params.mergeData
    ? renderMergeTags(params.body, params.mergeData)
    : params.body;

  // Create notification document
  const notification = await NotificationModel.create({
    recipientId: params.recipientId,
    recipientType: params.recipientType,
    type: params.type,
    title: renderedTitle,
    body: renderedBody,
    channels: params.channels,
    channelResults: {},
    data: params.data,
    relatedResource: params.relatedResource,
    relatedResourceId: params.relatedResourceId,
  });

  const channelResults: Record<string, ChannelResult> = {};
  const quietHoursDelays: Array<{ channel: NotificationChannel; delayMs: number }> = [];

  // Dispatch per channel
  for (const channel of params.channels) {
    // NTF-INV-01: Check user preferences
    const enabled = await isChannelEnabled(params.recipientId, params.type, channel);
    if (!enabled) {
      channelResults[channel] = { sent: false, error: 'disabled_by_preference' };
      continue;
    }

    // NTF-INV-02: Quiet hours check (push/sms only)
    if (!QUIET_HOURS_EXEMPT_CHANNELS.includes(channel)) {
      const quietConfig = await getQuietHoursConfig(params.recipientId);
      if (quietConfig.enabled) {
        const delay = calculateQuietHoursDelay(
          quietConfig.timezone,
          quietConfig.start,
          quietConfig.end,
        );
        if (delay > 0) {
          channelResults[channel] = { sent: false, error: 'quiet_hours_queued' };
          quietHoursDelays.push({ channel, delayMs: delay });
          continue;
        }
      }
    }

    // in_app: No external provider needed
    if (channel === 'in_app') {
      channelResults[channel] = { sent: true, sentAt: new Date() };
      continue;
    }

    // Push: Send to all FCM tokens
    if (channel === 'push') {
      const pushResult = await sendPush(params.recipientId, renderedTitle, renderedBody, params.data);
      channelResults[channel] = pushResult;
      continue;
    }

    // External providers (sms, email, slack)
    const provider = providers.get(channel);
    if (!provider) {
      channelResults[channel] = { sent: false, error: `${channel}_provider_not_configured` };
      continue;
    }

    // Get recipient contact info for the channel
    const contactInfo = await getRecipientContact(params.recipientId, channel);
    if (!contactInfo) {
      channelResults[channel] = { sent: false, error: `no_${channel}_contact` };
      continue;
    }

    const result = await provider.send({
      to: contactInfo,
      title: renderedTitle,
      body: renderedBody,
      subject: renderedTitle,
    });

    channelResults[channel] = {
      sent: result.success,
      sentAt: result.success ? new Date() : undefined,
      gatewayId: result.gatewayId,
      error: result.error,
    };
  }

  // Update notification with channel results
  notification.channelResults = channelResults;
  await notification.save();

  return {
    notification,
    quietHoursDelays: quietHoursDelays.length > 0 ? quietHoursDelays : undefined,
  };
}

// ─── Push Notification (FCM multi-token) ────────────────────────────────────

async function sendPush(
  recipientId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<ChannelResult> {
  const provider = providers.get('push');
  if (!provider) {
    return { sent: false, error: 'push_provider_not_configured' };
  }

  // Get user's FCM tokens
  const user = await UserModel.findById(recipientId).select('fcmTokens').lean();
  if (!user) {
    return { sent: false, error: 'user_not_found' };
  }

  const fcmTokens = (user as unknown as { fcmTokens?: Array<{ token: string; deviceId: string }> }).fcmTokens;
  if (!fcmTokens || fcmTokens.length === 0) {
    return { sent: false, error: 'no_fcm_tokens' };
  }

  let anySent = false;
  const invalidTokens: string[] = [];

  for (const tokenEntry of fcmTokens) {
    const result = await provider.send({
      to: tokenEntry.token,
      title,
      body,
      data,
    });

    if (result.success) {
      anySent = true;
    } else if (result.error === 'INVALID_TOKEN') {
      // NTF-INV-03: Track invalid token for cleanup
      invalidTokens.push(tokenEntry.token);
    }
  }

  // NTF-INV-03: Remove invalid FCM tokens
  if (invalidTokens.length > 0) {
    await UserModel.updateOne(
      { _id: recipientId },
      { $pull: { fcmTokens: { token: { $in: invalidTokens } } } },
    );
  }

  return {
    sent: anySent,
    sentAt: anySent ? new Date() : undefined,
    error: anySent ? undefined : 'all_push_sends_failed',
  };
}

// ─── Contact Info Resolution ────────────────────────────────────────────────

async function getRecipientContact(
  recipientId: string,
  channel: NotificationChannel,
): Promise<string | null> {
  if (channel === 'slack') {
    // Slack sends to webhook, not a user-specific address
    return 'webhook';
  }

  const user = await UserModel.findById(recipientId)
    .select('mobile email')
    .lean();

  if (!user) return null;

  const userDoc = user as unknown as { mobile?: string; email?: string };

  if (channel === 'sms') return userDoc.mobile ?? null;
  if (channel === 'email') return userDoc.email ?? null;

  return null;
}

// ─── Read Operations ────────────────────────────────────────────────────────

export async function markAsRead(
  notificationId: string,
  recipientId: string,
): Promise<INotificationDocument | null> {
  return NotificationModel.findOneAndUpdate(
    { _id: notificationId, recipientId },
    { isRead: true, readAt: new Date() },
    { new: true },
  );
}

export async function markAllAsRead(
  recipientId: string,
): Promise<number> {
  const result = await NotificationModel.updateMany(
    { recipientId, isRead: false },
    { isRead: true, readAt: new Date() },
  );
  return result.modifiedCount;
}

export async function getUnreadCount(
  recipientId: string,
): Promise<number> {
  return NotificationModel.countDocuments({ recipientId, isRead: false });
}

export async function listNotifications(
  recipientId: string,
  filters: {
    isRead?: boolean;
    type?: string;
    page?: number;
    limit?: number;
  },
): Promise<{ notifications: INotificationDocument[]; total: number }> {
  const query: Record<string, unknown> = { recipientId };
  if (filters.isRead !== undefined) query.isRead = filters.isRead;
  if (filters.type) query.type = filters.type;

  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;

  const [notifications, total] = await Promise.all([
    NotificationModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    NotificationModel.countDocuments(query),
  ]);

  return { notifications: notifications as unknown as INotificationDocument[], total };
}
