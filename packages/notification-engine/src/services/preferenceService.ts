import type { Model } from 'mongoose';
import type {
  INotificationPreferenceDocument,
  NotificationType,
  NotificationChannel,
  ChannelPreferences,
  PreferenceLanguage,
} from '../types';

// ─── Module State ───────────────────────────────────────────────────────────

let PreferenceModel: Model<INotificationPreferenceDocument>;

export function initPreferenceService(
  model: Model<INotificationPreferenceDocument>,
): void {
  PreferenceModel = model;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get notification preferences for a user.
 * Returns null if no preferences have been set (defaults apply).
 */
export async function getPreferences(
  userId: string,
): Promise<INotificationPreferenceDocument | null> {
  return PreferenceModel.findOne({ userId });
}

/**
 * Create or update notification preferences.
 */
export async function upsertPreferences(
  userId: string,
  data: {
    preferences?: Record<string, ChannelPreferences>;
    quietHoursEnabled?: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    timezone?: string;
    language?: PreferenceLanguage;
  },
): Promise<INotificationPreferenceDocument> {
  const result = await PreferenceModel.findOneAndUpdate(
    { userId },
    { $set: { ...data, userId } },
    { new: true, upsert: true, runValidators: true },
  );
  return result;
}

/**
 * NTF-INV-01: Check if a specific channel is enabled for a notification type.
 * Defaults to true if no preference exists for the type/channel.
 */
export async function isChannelEnabled(
  userId: string,
  notificationType: NotificationType,
  channel: NotificationChannel,
): Promise<boolean> {
  // Slack and in_app are not user-configurable — always enabled
  if (channel === 'slack' || channel === 'in_app') {
    return true;
  }

  const prefs = await PreferenceModel.findOne({ userId });
  if (!prefs) {
    return true; // No preferences set — all channels enabled by default
  }

  const typePrefs = prefs.preferences as unknown as Map<string, ChannelPreferences> | undefined;
  if (!typePrefs || !(typePrefs instanceof Map)) {
    return true;
  }

  const entry = typePrefs.get(notificationType);
  if (!entry) {
    return true; // No entry for this type — default enabled
  }

  // Map channel name to preference key
  const channelKey = channel as keyof ChannelPreferences;
  if (channelKey in entry) {
    return entry[channelKey];
  }

  return true;
}

/**
 * Get quiet hours config for a user with defaults applied.
 */
export async function getQuietHoursConfig(
  userId: string,
): Promise<{
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
}> {
  const prefs = await PreferenceModel.findOne({ userId });
  return {
    enabled: prefs?.quietHoursEnabled ?? false,
    start: prefs?.quietHoursStart ?? '21:00',
    end: prefs?.quietHoursEnd ?? '08:00',
    timezone: prefs?.timezone ?? 'Australia/Sydney',
  };
}
