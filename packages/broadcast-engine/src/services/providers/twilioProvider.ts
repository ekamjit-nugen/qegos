import type { IChannelProvider, ChannelContent, SendResult, DeliveryStatus } from '../../types';

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sid: string): { fetch: () => Promise<{ sid: string; status: string; errorMessage?: string }> };
  };
}

let twilioClient: TwilioClient | null = null;
let twilioConfig: TwilioConfig | null = null;

export function initTwilioProvider(config: TwilioConfig): void {
  twilioConfig = config;
  // Dynamic require to avoid hard dependency — Twilio is a peer dep
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Twilio = require('twilio');
    twilioClient = new Twilio(config.accountSid, config.authToken) as TwilioClient;
  } catch {
    // Twilio not installed — provider will be unavailable
    twilioClient = null;
  }
}

export const twilioProvider: IChannelProvider = {
  channel: 'sms',

  async send(content: ChannelContent): Promise<SendResult> {
    if (!twilioClient || !twilioConfig) {
      return { success: false, error: 'Twilio provider not initialized' };
    }

    try {
      const result = await twilioClient.messages.create({
        to: content.to,
        from: twilioConfig.phoneNumber,
        body: content.body,
      });

      return {
        success: true,
        gatewayId: result.sid,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown Twilio error';
      return { success: false, error: message };
    }
  },

  async checkDeliveryStatus(gatewayId: string): Promise<DeliveryStatus> {
    if (!twilioClient) {
      return { gatewayId, status: 'failed', error: 'Twilio provider not initialized' };
    }

    try {
      const msg = await (twilioClient.messages as unknown as (sid: string) => { fetch: () => Promise<{ sid: string; status: string; errorMessage?: string }> })(gatewayId).fetch();

      const statusMap: Record<string, DeliveryStatus['status']> = {
        delivered: 'delivered',
        sent: 'sent',
        failed: 'failed',
        undelivered: 'failed',
      };

      return {
        gatewayId,
        status: statusMap[msg.status] ?? 'sent',
        error: msg.errorMessage,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { gatewayId, status: 'failed', error: message };
    }
  },
};
