import type { INotificationChannelProvider, NotificationChannelContent, NotificationSendResult } from '../../types';

interface FCMConfig {
  serviceAccountJson: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let messagingClient: any = null;

export function initFCMProvider(config: FCMConfig): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin = require('firebase-admin');

    const serviceAccount = JSON.parse(config.serviceAccountJson);

    // Avoid reinitializing if already initialized
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    messagingClient = admin.messaging();
  } catch {
    messagingClient = null;
  }
}

export const fcmProvider: INotificationChannelProvider = {
  channel: 'push',

  async send(content: NotificationChannelContent): Promise<NotificationSendResult> {
    if (!messagingClient) {
      return { success: false, error: 'FCM provider not initialized' };
    }

    try {
      const messageId = await messagingClient.send({
        token: content.to,
        notification: {
          title: content.title,
          body: content.body,
        },
        data: content.data
          ? Object.fromEntries(
              Object.entries(content.data).map(([k, v]) => [k, String(v)]),
            )
          : undefined,
        android: { priority: 'high' as const },
        apns: { headers: { 'apns-priority': '10' } },
      });

      return { success: true, gatewayId: messageId };
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };

      // NTF-INV-03: Signal invalid token for cleanup
      if (
        error.code === 'messaging/registration-token-not-registered' ||
        error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/invalid-argument'
      ) {
        return { success: false, error: 'INVALID_TOKEN' };
      }

      return {
        success: false,
        error: error.message ?? 'Unknown FCM error',
      };
    }
  },
};
