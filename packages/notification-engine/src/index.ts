import type { Connection, Model, Document } from 'mongoose';
import type Redis from 'ioredis';
import { createNotificationModel } from './models/notificationModel';
import { createNotificationPreferenceModel } from './models/notificationPreferenceModel';
import { initFCMProvider, fcmProvider } from './services/providers/fcmProvider';
import { initSlackProvider, slackProvider } from './services/providers/slackProvider';
import { initTwilioProvider, twilioProvider } from './services/providers/twilioProvider';
import { initSESProvider, sesProvider } from './services/providers/sesProvider';
import { initPreferenceService } from './services/preferenceService';
import { initNotificationService } from './services/notificationService';
import type {
  NotificationEngineConfig,
  NotificationEngineInitResult,
  NotificationChannel,
  INotificationChannelProvider,
} from './types';

/**
 * Initialize the notification engine package.
 *
 * The consuming app provides:
 * - Mongoose connection (Database Isolation rule)
 * - Redis client for dedup and quiet hours scheduling
 * - Channel credentials (FCM, Slack, Twilio, SES) — optional per channel
 * - User model for FCM token access and contact resolution
 */
export function init(
  connection: Connection,
  redisClient: Redis,
  config: NotificationEngineConfig,
  externalModels: {
    UserModel: Model<Document>;
  },
): NotificationEngineInitResult {
  // Create models
  const NotificationModel = createNotificationModel(connection);
  const NotificationPreferenceModel = createNotificationPreferenceModel(connection);

  // Initialize providers (only if credentials provided)
  const providers = new Map<NotificationChannel, INotificationChannelProvider>();

  if (config.firebaseServiceAccountJson) {
    initFCMProvider({ serviceAccountJson: config.firebaseServiceAccountJson });
    providers.set('push', fcmProvider);
  }

  if (config.slackWebhookUrl) {
    initSlackProvider({ webhookUrl: config.slackWebhookUrl });
    providers.set('slack', slackProvider);
  }

  if (config.twilioAccountSid && config.twilioAuthToken && config.twilioPhoneNumber) {
    initTwilioProvider({
      accountSid: config.twilioAccountSid,
      authToken: config.twilioAuthToken,
      phoneNumber: config.twilioPhoneNumber,
    });
    providers.set('sms', twilioProvider);
  }

  if (config.sesRegion && config.sesAccessKeyId && config.sesSecretAccessKey && config.sesFromEmail) {
    initSESProvider({
      region: config.sesRegion,
      accessKeyId: config.sesAccessKeyId,
      secretAccessKey: config.sesSecretAccessKey,
      fromEmail: config.sesFromEmail,
    });
    providers.set('email', sesProvider);
  }

  // Initialize services
  initPreferenceService(NotificationPreferenceModel);
  initNotificationService(
    NotificationModel,
    NotificationPreferenceModel,
    redisClient,
    providers,
    config,
    externalModels,
  );

  return {
    NotificationModel,
    NotificationPreferenceModel,
    providers,
  };
}

// Re-export everything
export * from './types';
export { createNotificationModel } from './models/notificationModel';
export { createNotificationPreferenceModel } from './models/notificationPreferenceModel';
export { fcmProvider, initFCMProvider } from './services/providers/fcmProvider';
export { slackProvider, initSlackProvider } from './services/providers/slackProvider';
export { twilioProvider, initTwilioProvider } from './services/providers/twilioProvider';
export { sesProvider, initSESProvider } from './services/providers/sesProvider';
export { renderMergeTags } from './services/templateService';
export {
  initPreferenceService,
  getPreferences,
  upsertPreferences,
  isChannelEnabled,
  getQuietHoursConfig,
} from './services/preferenceService';
export {
  initNotificationService,
  send,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  listNotifications,
  calculateQuietHoursDelay,
  buildDedupKey,
} from './services/notificationService';
export { createNotificationRoutes } from './routes/notificationRoutes';
export {
  validateListNotifications,
  validateMarkRead,
  validateUpdatePreferences,
  validateSendNotification,
} from './validators/notificationValidators';
