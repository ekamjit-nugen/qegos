import type { INotificationChannelProvider, NotificationChannelContent, NotificationSendResult } from '../../types';

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

interface TwilioClient {
  messages: {
    create: (params: {
      to: string;
      from: string;
      body: string;
    }) => Promise<{ sid: string; status: string }>;
  };
}

let twilioClient: TwilioClient | null = null;
let twilioConfig: TwilioConfig | null = null;

export function initTwilioProvider(config: TwilioConfig): void {
  twilioConfig = config;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Twilio = require('twilio');
    twilioClient = new Twilio(config.accountSid, config.authToken) as TwilioClient;
  } catch {
    twilioClient = null;
  }
}

export const twilioProvider: INotificationChannelProvider = {
  channel: 'sms',

  async send(content: NotificationChannelContent): Promise<NotificationSendResult> {
    if (!twilioClient || !twilioConfig) {
      return { success: false, error: 'Twilio provider not initialized' };
    }

    try {
      const result = await twilioClient.messages.create({
        to: content.to,
        from: twilioConfig.phoneNumber,
        body: content.body,
      });

      return { success: true, gatewayId: result.sid };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown Twilio error';
      return { success: false, error: message };
    }
  },
};
