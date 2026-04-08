export type WhatsAppDirection = 'inbound' | 'outbound';

export type WhatsAppStatus = 'sent' | 'delivered' | 'read' | 'failed';

export const WHATSAPP_STATUS_COLORS: Record<WhatsAppStatus, string> = {
  sent: 'blue',
  delivered: 'cyan',
  read: 'green',
  failed: 'red',
};

export interface WhatsAppMessage {
  _id: string;
  direction: WhatsAppDirection;
  contactMobile: string;
  messageType: string;
  templateName?: string;
  content?: string;
  status: WhatsAppStatus;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  createdAt: string;
}

export interface WhatsAppMessageListQuery {
  page?: number;
  limit?: number;
  direction?: WhatsAppDirection;
  status?: WhatsAppStatus;
}
