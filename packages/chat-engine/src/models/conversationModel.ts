import { Schema, type Connection, type Model } from 'mongoose';
import type { IChatConversationDocument, ConversationStatus } from '../types';
import { CONVERSATION_STATUSES } from '../types';

const chatConversationSchema = new Schema<IChatConversationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    status: {
      type: String,
      required: true,
      enum: CONVERSATION_STATUSES,
      default: 'active' as ConversationStatus,
    },
    lastMessageAt: { type: Date },
    lastMessagePreview: { type: String, maxlength: 100 },
    unreadCountUser: { type: Number, default: 0 },
    unreadCountStaff: { type: Number, default: 0 },
    subject: { type: String },
  },
  {
    timestamps: true,
    collection: 'chat_conversations',
  },
);

// ─── Indexes ────────────────────────────────────────────────────────────────

// CHT-INV-03: One active conversation per client
chatConversationSchema.index(
  { userId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);

chatConversationSchema.index({ staffId: 1, status: 1 });
chatConversationSchema.index({ lastMessageAt: -1 });

// ─── Factory ────────────────────────────────────────────────────────────────

export function createChatConversationModel(
  connection: Connection,
): Model<IChatConversationDocument> {
  if (connection.models.ChatConversation) {
    return connection.models.ChatConversation as Model<IChatConversationDocument>;
  }
  return connection.model<IChatConversationDocument>('ChatConversation', chatConversationSchema);
}
