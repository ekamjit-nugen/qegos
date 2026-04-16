import type {
  INotificationChannelProvider,
  NotificationChannelContent,
  NotificationSendResult,
} from '../../types';

let webhookUrl: string | null = null;

export function initSlackProvider(config: { webhookUrl: string }): void {
  webhookUrl = config.webhookUrl;
}

export const slackProvider: INotificationChannelProvider = {
  channel: 'slack',

  async send(content: NotificationChannelContent): Promise<NotificationSendResult> {
    if (!webhookUrl) {
      return { success: false, error: 'Slack provider not initialized' };
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `*${content.title}*\n${content.body}`,
        }),
      });

      if (response.ok) {
        return { success: true };
      }

      const responseText = await response.text();
      return { success: false, error: `Slack API error: ${response.status} ${responseText}` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown Slack error';
      return { success: false, error: message };
    }
  },
};
