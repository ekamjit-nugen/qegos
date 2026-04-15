import type { Document, Types } from 'mongoose';

// ─── Enums / Unions ─────────────────────────────────────────────────────────

export type WhatsAppDirection = 'inbound' | 'outbound';

export type WhatsAppContactType = 'lead' | 'user' | 'unknown';

export type WhatsAppMessageType =
  | 'template' | 'text' | 'image' | 'document' | 'audio' | 'video' | 'reaction';

export const WHATSAPP_MESSAGE_TYPES: WhatsAppMessageType[] = [
  'template', 'text', 'image', 'document', 'audio', 'video', 'reaction',
];

export type WhatsAppMessageStatus = 'sent' | 'delivered' | 'read' | 'failed';

export type WhatsAppQualityRating = 'green' | 'yellow' | 'red';

// ─── 24-hour Messaging Window (WHA-INV-03) ──────────────────────────────────

export const FREEFORM_WINDOW_HOURS = 24;

// ─── Phone Number Formatting (WHA-INV-04) ───────────────────────────────────

/**
 * Convert E.164 (+61XXXXXXXXX) to Meta format (61XXXXXXXXX).
 */
export function toMetaFormat(e164: string): string {
  return e164.replace(/^\+/, '');
}

/**
 * Convert Meta format (61XXXXXXXXX) to E.164 (+61XXXXXXXXX).
 */
export function toE164(metaFormat: string): string {
  return metaFormat.startsWith('+') ? metaFormat : `+${metaFormat}`;
}

// ─── WhatsApp Config Interface ──────────────────────────────────────────────

export interface IWhatsAppConfig {
  metaBusinessAccountId?: string;
  phoneNumberId: string;
  accessToken: string;
  webhookVerifyToken: string;
  isConnected: boolean;
  dailyMessageQuota: number;
  qualityRating: WhatsAppQualityRating;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWhatsAppConfigDocument extends IWhatsAppConfig, Document {}

// ─── WhatsApp Message Log Interface ─────────────────────────────────────────

export interface IWhatsAppMessage {
  direction: WhatsAppDirection;
  contactId?: Types.ObjectId;
  contactType: WhatsAppContactType;
  contactMobile: string;
  waMessageId?: string;
  messageType: WhatsAppMessageType;
  templateName?: string;
  templateParams?: string[];
  content?: string;
  mediaUrl?: string;
  mediaOriginalUrl?: string;
  mediaMimeType?: string;
  status: WhatsAppMessageStatus;
  failureReason?: string;
  leadActivityId?: Types.ObjectId;
  vaultDocumentId?: Types.ObjectId;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  conversationWindowExpiresAt?: Date;
  createdAt: Date;
}

export interface IWhatsAppMessageDocument extends IWhatsAppMessage, Document {}

// ─── Config ─────────────────────────────────────────────────────────────────

export interface WhatsAppConnectorConfig {
  /** Meta Cloud API access token */
  accessToken?: string;
  /** WhatsApp Business phone number ID */
  phoneNumberId?: string;
  /** Webhook verification token */
  webhookVerifyToken?: string;
  /** Meta Cloud API base URL */
  apiBaseUrl?: string;
}

// ─── Route Dependencies ─────────────────────────────────────────────────────

export interface WhatsAppRouteDeps {
  ConfigModel: import('mongoose').Model<IWhatsAppConfigDocument>;
  MessageModel: import('mongoose').Model<IWhatsAppMessageDocument>;
  authenticate: import('express').RequestHandler;
  checkPermission: import('@nugen/rbac').CheckPermissionFn;
  auditLog: import('@nugen/audit-log').AuditLogDI;
  config: WhatsAppConnectorConfig;
  /** Broadcast DND check function (WHA-INV-07) */
  checkDnd?: (contact: string, channel: string) => Promise<boolean>;
}
