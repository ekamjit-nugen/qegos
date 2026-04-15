import { Schema, type Connection, type Model } from 'mongoose';
import type { IChatMessageDocument, MessageType, SenderType } from '../types';
import { MESSAGE_TYPES } from '../types';

const chatMessageSchema = new Schema<IChatMessageDocument>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'ChatConversation', required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderType: {
      type: String,
      required: true,
      enum: ['client', 'staff', 'system'] as SenderType[],
    },
    type: {
      type: String,
      required: true,
      enum: MESSAGE_TYPES,
      default: 'text' as MessageType,
    },
    content: { type: String, required: true },
    contentOriginal: { type: String }, // Encrypted, TFN-bearing original
    fileUrl: { type: String },
    fileName: { type: String },
    fileSize: { type: Number },
    mimeType: { type: String },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'chat_messages',
  },
);

// ─── Indexes ────────────────────────────────────────────────────────────────

chatMessageSchema.index({ conversationId: 1, createdAt: -1 });
chatMessageSchema.index({ senderId: 1 });

// Text search over sanitized content. `contentOriginal` holds the encrypted
// TFN-bearing original — never indexed. `content` is the TFN-redacted copy.
chatMessageSchema.index({ content: 'text' }, { name: 'content_text' });

// ─── Factory ────────────────────────────────────────────────────────────────

export function createChatMessageModel(
  connection: Connection,
): Model<IChatMessageDocument> {
  if (connection.models.ChatMessage) {
    return connection.models.ChatMessage as Model<IChatMessageDocument>;
  }
  return connection.model<IChatMessageDocument>('ChatMessage', chatMessageSchema);
}
