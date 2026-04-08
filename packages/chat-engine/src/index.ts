import type { Connection, Model } from 'mongoose';
import type { IChatConversationDocument, IChatMessageDocument, ICannedResponseDocument, ChatEngineConfig } from './types';
import { createChatConversationModel } from './models/conversationModel';
import { createChatMessageModel } from './models/messageModel';
import { createCannedResponseModel } from './models/cannedResponseModel';
import { initChatService } from './services/chatService';
import { initTfnRedaction } from './services/tfnRedaction';

// ─── Init Result ────────────────────────────────────────────────────────────

export interface ChatEngineInitResult {
  ConversationModel: Model<IChatConversationDocument>;
  MessageModel: Model<IChatMessageDocument>;
  CannedResponseModel: Model<ICannedResponseDocument>;
}

// ─── Init ───────────────────────────────────────────────────────────────────

export function init(
  connection: Connection,
  config: ChatEngineConfig,
): ChatEngineInitResult {
  const ConversationModel = createChatConversationModel(connection);
  const MessageModel = createChatMessageModel(connection);
  const CannedResponseModel = createCannedResponseModel(connection);

  initChatService(ConversationModel, MessageModel, CannedResponseModel);
  initTfnRedaction(config.encryptionKey);

  return { ConversationModel, MessageModel, CannedResponseModel };
}

// ─── Re-exports ─────────────────────────────────────────────────────────────

export type {
  IChatConversation,
  IChatConversationDocument,
  IChatMessage,
  IChatMessageDocument,
  ICannedResponse,
  ICannedResponseDocument,
  ConversationStatus,
  MessageType,
  SenderType,
  CannedResponseCategory,
  ChatEngineConfig,
  ChatEngineRouteDeps,
  ServerToClientEvents,
  ClientToServerEvents,
} from './types';

export {
  CONVERSATION_STATUSES,
  MESSAGE_TYPES,
  CANNED_RESPONSE_CATEGORIES,
  TFN_PATTERN,
  TFN_REPLACEMENT,
} from './types';

export { createChatConversationModel } from './models/conversationModel';
export { createChatMessageModel } from './models/messageModel';
export { createCannedResponseModel } from './models/cannedResponseModel';

export {
  initTfnRedaction,
  containsTfn,
  redactTfn,
  encryptContent,
  decryptContent,
  processMessageContent,
} from './services/tfnRedaction';

export {
  initChatService,
  findOrCreateConversation,
  getConversation,
  listConversations,
  resolveConversation,
  transferConversation,
  sendMessage,
  getMessages,
  markMessageRead,
  getUnreadCount,
  listCannedResponses,
  createCannedResponse,
  incrementCannedUsage,
  archiveOldConversations,
} from './services/chatService';

export { createChatRoutes } from './routes/chatRoutes';

export {
  createConversationValidation,
  sendMessageValidation,
  markReadValidation,
  resolveConversationValidation,
  transferConversationValidation,
  createCannedResponseValidation,
  searchMessagesValidation,
} from './validators/chatValidators';

export {
  initChatSocket,
  emitNewMessage,
  emitMessageRead,
  emitConversationResolved,
  getSocketServer,
} from './socket/chatSocketHandler';

export type { ChatSocketConfig, ChatSocketServer } from './socket/chatSocketHandler';
