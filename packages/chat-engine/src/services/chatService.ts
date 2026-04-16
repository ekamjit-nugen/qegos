import type { Model, Types } from 'mongoose';
import type {
  IChatConversationDocument,
  IChatMessageDocument,
  ICannedResponseDocument,
  MessageType,
  SenderType,
  CannedResponseCategory,
} from '../types';
import { processMessageContent } from './tfnRedaction';

// ─── Module State ───────────────────────────────────────────────────────────

let ConversationModel: Model<IChatConversationDocument>;
let MessageModel: Model<IChatMessageDocument>;
let CannedResponseModel: Model<ICannedResponseDocument>;

export function initChatService(
  convModel: Model<IChatConversationDocument>,
  msgModel: Model<IChatMessageDocument>,
  cannedModel: Model<ICannedResponseDocument>,
): void {
  ConversationModel = convModel;
  MessageModel = msgModel;
  CannedResponseModel = cannedModel;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find or create active conversation (CHT-INV-03: one active per client).
 */
export async function findOrCreateConversation(
  userId: Types.ObjectId,
  staffId?: Types.ObjectId,
  orderId?: Types.ObjectId,
  subject?: string,
): Promise<IChatConversationDocument> {
  // CHT-INV-03: Find existing active conversation
  const existing = await ConversationModel.findOne({
    userId,
    status: 'active',
  });

  if (existing) {
    return existing;
  }

  return ConversationModel.create({
    userId,
    staffId,
    orderId,
    status: 'active',
    subject,
  });
}

export async function getConversation(
  conversationId: Types.ObjectId,
): Promise<IChatConversationDocument | null> {
  return ConversationModel.findById(conversationId);
}

export async function listConversations(
  filters: { userId?: Types.ObjectId; staffId?: Types.ObjectId; status?: string },
  page = 1,
  limit = 20,
): Promise<{ conversations: IChatConversationDocument[]; total: number }> {
  const query: Record<string, unknown> = {};
  if (filters.userId) {
    query.userId = filters.userId;
  }
  if (filters.staffId) {
    query.staffId = filters.staffId;
  }
  if (filters.status) {
    query.status = filters.status;
  }

  const [conversations, total] = await Promise.all([
    ConversationModel.find(query)
      .sort({ lastMessageAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    ConversationModel.countDocuments(query),
  ]);

  return { conversations, total };
}

export async function resolveConversation(
  conversationId: Types.ObjectId,
): Promise<IChatConversationDocument | null> {
  return ConversationModel.findByIdAndUpdate(
    conversationId,
    { $set: { status: 'resolved' } },
    { new: true },
  );
}

/**
 * Transfer conversation to different staff (CHT-INV-07).
 * Preserves full history, creates system message.
 */
export async function transferConversation(
  conversationId: Types.ObjectId,
  newStaffId: Types.ObjectId,
  newStaffName: string,
): Promise<IChatConversationDocument | null> {
  const conv = await ConversationModel.findByIdAndUpdate(
    conversationId,
    { $set: { staffId: newStaffId } },
    { new: true },
  );

  if (!conv) {
    return null;
  }

  // CHT-INV-07: System message notifying client
  await MessageModel.create({
    conversationId,
    senderId: newStaffId,
    senderType: 'system' as SenderType,
    type: 'system_event' as MessageType,
    content: `You're now speaking with ${newStaffName}.`,
    isRead: false,
  });

  return conv;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SendMessageParams {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  senderType: SenderType;
  type?: MessageType;
  content: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}

export async function sendMessage(params: SendMessageParams): Promise<IChatMessageDocument> {
  // CHT-INV-01: TFN redaction
  const { content, contentOriginal } = processMessageContent(params.content);

  const message = await MessageModel.create({
    conversationId: params.conversationId,
    senderId: params.senderId,
    senderType: params.senderType,
    type: params.type ?? 'text',
    content,
    contentOriginal,
    fileUrl: params.fileUrl,
    fileName: params.fileName,
    fileSize: params.fileSize,
    mimeType: params.mimeType,
    isRead: false,
  });

  // Update conversation metadata
  const preview = content.length > 100 ? content.slice(0, 100) : content;
  const unreadField = params.senderType === 'client' ? 'unreadCountStaff' : 'unreadCountUser';

  await ConversationModel.findByIdAndUpdate(params.conversationId, {
    $set: { lastMessageAt: new Date(), lastMessagePreview: preview },
    $inc: { [unreadField]: 1 },
  });

  return message;
}

export async function getMessages(
  conversationId: Types.ObjectId,
  page = 1,
  limit = 50,
): Promise<{ messages: IChatMessageDocument[]; total: number }> {
  const [messages, total] = await Promise.all([
    MessageModel.find({ conversationId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    MessageModel.countDocuments({ conversationId }),
  ]);

  return { messages, total };
}

export async function markMessageRead(
  messageId: Types.ObjectId,
): Promise<IChatMessageDocument | null> {
  return MessageModel.findByIdAndUpdate(
    messageId,
    { $set: { isRead: true, readAt: new Date() } },
    { new: true },
  );
}

export async function getUnreadCount(userId: Types.ObjectId, role: string): Promise<number> {
  const field = role === 'client' ? 'unreadCountUser' : 'unreadCountStaff';
  const queryField = role === 'client' ? 'userId' : 'staffId';

  const result = await ConversationModel.aggregate([
    { $match: { [queryField]: userId, status: 'active' } },
    { $group: { _id: null, total: { $sum: `$${field}` } } },
  ]);

  return result[0]?.total ?? 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CANNED RESPONSES
// ═══════════════════════════════════════════════════════════════════════════════

export async function listCannedResponses(
  staffId: Types.ObjectId,
  category?: CannedResponseCategory,
): Promise<ICannedResponseDocument[]> {
  const query: Record<string, unknown> = {
    $or: [{ isGlobal: true }, { createdBy: staffId }],
  };
  if (category) {
    query.category = category;
  }

  return CannedResponseModel.find(query).sort({ usageCount: -1 });
}

export async function createCannedResponse(data: {
  title: string;
  content: string;
  category: CannedResponseCategory;
  createdBy: Types.ObjectId;
  isGlobal?: boolean;
}): Promise<ICannedResponseDocument> {
  return CannedResponseModel.create(data);
}

export async function incrementCannedUsage(responseId: Types.ObjectId): Promise<void> {
  await CannedResponseModel.findByIdAndUpdate(responseId, { $inc: { usageCount: 1 } });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRON: Archive old conversations (CHT-INV-05)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Archive conversations older than 2 years. Archived chats = read-only.
 */
export async function archiveOldConversations(yearsThreshold = 2): Promise<number> {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - yearsThreshold);

  const result = await ConversationModel.updateMany(
    { status: 'resolved', updatedAt: { $lte: cutoff } },
    { $set: { status: 'archived' } },
  );

  return result.modifiedCount;
}
