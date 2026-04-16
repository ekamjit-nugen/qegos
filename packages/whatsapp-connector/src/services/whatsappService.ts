import type { Model, Types } from 'mongoose';
import type {
  IWhatsAppMessageDocument,
  IWhatsAppConfigDocument,
  WhatsAppContactType,
  WhatsAppMessageType,
} from '../types';
import { FREEFORM_WINDOW_HOURS, toE164 } from '../types';

// ─── Module State ───────────────────────────────────────────────────────────

let MessageModel: Model<IWhatsAppMessageDocument>;
let ConfigModel: Model<IWhatsAppConfigDocument>;

export function initWhatsAppService(
  msgModel: Model<IWhatsAppMessageDocument>,
  cfgModel: Model<IWhatsAppConfigDocument>,
): void {
  MessageModel = msgModel;
  ConfigModel = cfgModel;
}

// ─── Config Management ──────────────────────────────────────────────────────

export async function getConfig(): Promise<IWhatsAppConfigDocument | null> {
  return ConfigModel.findOne();
}

export async function updateConfig(
  updates: Partial<Record<string, unknown>>,
): Promise<IWhatsAppConfigDocument | null> {
  return ConfigModel.findOneAndUpdate({}, { $set: updates }, { upsert: true, new: true });
}

// ─── Message Logging ────────────────────────────────────────────────────────

export interface LogOutboundParams {
  contactId?: Types.ObjectId;
  contactType: WhatsAppContactType;
  contactMobile: string;
  messageType: WhatsAppMessageType;
  templateName?: string;
  templateParams?: string[];
  content?: string;
  waMessageId: string;
}

export async function logOutboundMessage(
  params: LogOutboundParams,
): Promise<IWhatsAppMessageDocument> {
  return MessageModel.create({
    direction: 'outbound',
    contactId: params.contactId,
    contactType: params.contactType,
    contactMobile: toE164(params.contactMobile),
    waMessageId: params.waMessageId,
    messageType: params.messageType,
    templateName: params.templateName,
    templateParams: params.templateParams,
    content: params.content,
    status: 'sent',
    sentAt: new Date(),
  });
}

export interface LogInboundParams {
  contactMobile: string;
  contactId?: Types.ObjectId;
  contactType: WhatsAppContactType;
  waMessageId: string;
  messageType: WhatsAppMessageType;
  content?: string;
  mediaOriginalUrl?: string;
  mediaMimeType?: string;
}

export async function logInboundMessage(
  params: LogInboundParams,
): Promise<IWhatsAppMessageDocument> {
  // Update conversation window for this contact
  const windowExpiry = new Date(Date.now() + FREEFORM_WINDOW_HOURS * 60 * 60 * 1000);

  return MessageModel.create({
    direction: 'inbound',
    contactId: params.contactId,
    contactType: params.contactType,
    contactMobile: toE164(params.contactMobile),
    waMessageId: params.waMessageId,
    messageType: params.messageType,
    content: params.content,
    mediaOriginalUrl: params.mediaOriginalUrl,
    mediaMimeType: params.mediaMimeType,
    status: 'delivered',
    deliveredAt: new Date(),
    conversationWindowExpiresAt: windowExpiry,
  });
}

// ─── Freeform Window Check (WHA-INV-03) ─────────────────────────────────────

/**
 * Check if freeform (non-template) messaging is allowed for this contact.
 * Returns the window expiry or null if window is closed.
 */
export async function checkFreeformWindow(
  contactMobile: string,
): Promise<{ allowed: boolean; expiresAt?: Date }> {
  const lastInbound = await MessageModel.findOne({
    contactMobile: toE164(contactMobile),
    direction: 'inbound',
    conversationWindowExpiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!lastInbound?.conversationWindowExpiresAt) {
    return { allowed: false };
  }

  return {
    allowed: true,
    expiresAt: lastInbound.conversationWindowExpiresAt,
  };
}

// ─── Delivery Status Updates ────────────────────────────────────────────────

export async function updateMessageStatus(
  waMessageId: string,
  status: 'delivered' | 'read' | 'failed',
  failureReason?: string,
): Promise<IWhatsAppMessageDocument | null> {
  const updates: Record<string, unknown> = { status };
  if (status === 'delivered') {
    updates.deliveredAt = new Date();
  }
  if (status === 'read') {
    updates.readAt = new Date();
  }
  if (failureReason) {
    updates.failureReason = failureReason;
  }

  return MessageModel.findOneAndUpdate({ waMessageId }, { $set: updates }, { new: true });
}

// ─── Conversation History ───────────────────────────────────────────────────

export async function getContactMessages(
  contactId: Types.ObjectId,
  page = 1,
  limit = 50,
): Promise<{ messages: IWhatsAppMessageDocument[]; total: number }> {
  const [messages, total] = await Promise.all([
    MessageModel.find({ contactId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    MessageModel.countDocuments({ contactId }),
  ]);

  return { messages, total };
}

// ─── Save Media to Vault (WHA-INV-06) ───────────────────────────────────────

export async function linkMediaToVault(
  messageId: Types.ObjectId,
  vaultDocumentId: Types.ObjectId,
  s3Url: string,
): Promise<IWhatsAppMessageDocument | null> {
  return MessageModel.findByIdAndUpdate(
    messageId,
    { $set: { vaultDocumentId, mediaUrl: s3Url } },
    { new: true },
  );
}
