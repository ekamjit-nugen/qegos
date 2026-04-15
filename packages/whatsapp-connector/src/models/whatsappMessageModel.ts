import { Schema, type Connection, type Model } from 'mongoose';
import type { IWhatsAppMessageDocument, WhatsAppDirection, WhatsAppContactType, WhatsAppMessageStatus } from '../types';
import { WHATSAPP_MESSAGE_TYPES } from '../types';

const whatsappMessageSchema = new Schema<IWhatsAppMessageDocument>(
  {
    direction: {
      type: String,
      required: true,
      enum: ['inbound', 'outbound'] as WhatsAppDirection[],
    },
    contactId: { type: Schema.Types.ObjectId },
    contactType: {
      type: String,
      required: true,
      enum: ['lead', 'user', 'unknown'] as WhatsAppContactType[],
      default: 'unknown',
    },
    contactMobile: { type: String, required: true }, // E.164 format
    waMessageId: { type: String },
    messageType: {
      type: String,
      required: true,
      enum: WHATSAPP_MESSAGE_TYPES,
    },
    templateName: { type: String },
    templateParams: [{ type: String }],
    content: { type: String },
    mediaUrl: { type: String }, // S3 URL for downloaded media
    mediaOriginalUrl: { type: String }, // Meta media ID (used to fetch the CDN URL)
    mediaMimeType: { type: String },
    mediaDownloadedAt: { type: Date }, // Set once uploadToS3 succeeds
    status: {
      type: String,
      required: true,
      enum: ['sent', 'delivered', 'read', 'failed'] as WhatsAppMessageStatus[],
      default: 'sent',
    },
    failureReason: { type: String },
    leadActivityId: { type: Schema.Types.ObjectId, ref: 'LeadActivity' },
    vaultDocumentId: { type: Schema.Types.ObjectId, ref: 'VaultDocument' },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    readAt: { type: Date },
    conversationWindowExpiresAt: { type: Date },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'whatsapp_messages',
  },
);

// ─── Indexes ────────────────────────────────────────────────────────────────

whatsappMessageSchema.index({ contactId: 1, createdAt: -1 });
whatsappMessageSchema.index({ contactMobile: 1, direction: 1 });
whatsappMessageSchema.index({ waMessageId: 1 }, { unique: true, sparse: true });

export function createWhatsAppMessageModel(
  connection: Connection,
): Model<IWhatsAppMessageDocument> {
  if (connection.models.WhatsAppMessage) {
    return connection.models.WhatsAppMessage as Model<IWhatsAppMessageDocument>;
  }
  return connection.model<IWhatsAppMessageDocument>('WhatsAppMessage', whatsappMessageSchema);
}
