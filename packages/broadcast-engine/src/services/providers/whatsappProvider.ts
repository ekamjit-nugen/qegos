import type { IChannelProvider, ChannelContent, SendResult, DeliveryStatus } from '../../types';

interface WhatsAppConfig {
  apiToken: string;
  phoneNumberId: string;
}

let whatsappConfig: WhatsAppConfig | null = null;

export function initWhatsAppProvider(config: WhatsAppConfig): void {
  whatsappConfig = config;
}

export const whatsappProvider: IChannelProvider = {
  channel: 'whatsapp',

  async send(content: ChannelContent): Promise<SendResult> {
    if (!whatsappConfig) {
      return { success: false, error: 'WhatsApp provider not initialized' };
    }

    try {
      const url = `https://graph.facebook.com/v18.0/${whatsappConfig.phoneNumberId}/messages`;

      // Build request body based on whether it's a template or text message
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let body: Record<string, any>;

      if (content.templateName) {
        // Template message (business-initiated)
        body = {
          messaging_product: 'whatsapp',
          to: content.to,
          type: 'template',
          template: {
            name: content.templateName,
            language: { code: 'en' },
            components: content.templateParams?.length
              ? [
                  {
                    type: 'body',
                    parameters: content.templateParams.map((p) => ({ type: 'text', text: p })),
                  },
                ]
              : undefined,
          },
        };
      } else {
        // Freeform text (within 24hr window)
        body = {
          messaging_product: 'whatsapp',
          to: content.to,
          type: 'text',
          text: { body: content.body },
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${whatsappConfig.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = (errorData as Record<string, unknown>).error
          ? JSON.stringify((errorData as Record<string, unknown>).error)
          : `HTTP ${response.status}`;
        return { success: false, error: errorMsg };
      }

      const data = (await response.json()) as { messages?: Array<{ id: string }> };
      const messageId = data.messages?.[0]?.id;

      return {
        success: true,
        gatewayId: messageId,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown WhatsApp error';
      return { success: false, error: message };
    }
  },

  async checkDeliveryStatus(gatewayId: string): Promise<DeliveryStatus> {
    // WhatsApp delivery status comes via Meta webhooks, not polling
    return { gatewayId, status: 'sent' };
  },
};
