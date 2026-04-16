import type {
  INotificationChannelProvider,
  NotificationChannelContent,
  NotificationSendResult,
} from '../../types';

interface SESConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fromEmail: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sesClient: any = null;
let sesConfig: SESConfig | null = null;

export function initSESProvider(config: SESConfig): void {
  sesConfig = config;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SESClient } = require('@aws-sdk/client-ses');
    sesClient = new SESClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  } catch {
    sesClient = null;
  }
}

export const sesProvider: INotificationChannelProvider = {
  channel: 'email',

  async send(content: NotificationChannelContent): Promise<NotificationSendResult> {
    if (!sesClient || !sesConfig) {
      return { success: false, error: 'SES provider not initialized' };
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SendEmailCommand } = require('@aws-sdk/client-ses');

      const command = new SendEmailCommand({
        Source: sesConfig.fromEmail,
        Destination: {
          ToAddresses: [content.to],
        },
        Message: {
          Subject: {
            Data: content.subject ?? content.title,
            Charset: 'UTF-8',
          },
          Body: {
            ...(content.htmlBody
              ? { Html: { Data: content.htmlBody, Charset: 'UTF-8' } }
              : { Text: { Data: content.body, Charset: 'UTF-8' } }),
          },
        },
      });

      const result = await sesClient.send(command);
      return { success: true, gatewayId: result.MessageId };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown SES error';
      return { success: false, error: message };
    }
  },
};
