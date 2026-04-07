import type { Document, Types } from 'mongoose';

// ─── Enums / Unions ─────────────────────────────────────────────────────────

export type ConversationStatus = 'active' | 'resolved' | 'archived';

export const CONVERSATION_STATUSES: ConversationStatus[] = ['active', 'resolved', 'archived'];

export type MessageType = 'text' | 'file' | 'canned_response' | 'system_event';

export const MESSAGE_TYPES: MessageType[] = ['text', 'file', 'canned_response', 'system_event'];

export type SenderType = 'client' | 'staff' | 'system';

export type CannedResponseCategory =
  | 'general' | 'documents' | 'payment' | 'status' | 'deadline' | 'tax_info';

export const CANNED_RESPONSE_CATEGORIES: CannedResponseCategory[] = [
  'general', 'documents', 'payment', 'status', 'deadline', 'tax_info',
];

// ─── TFN Redaction Pattern (CHT-INV-01) ─────────────────────────────────────

/** Matches 9-digit TFN in formats: XXX XXX XXX or XXXXXXXXX */
export const TFN_PATTERN = /\b(\d{3}\s\d{3}\s\d{3}|\d{9})\b/g;
export const TFN_REPLACEMENT = '*** *** ***';

// ─── Chat Conversation Interface ────────────────────────────────────────────

export interface IChatConversation {
  userId: Types.ObjectId;
  staffId?: Types.ObjectId;
  orderId?: Types.ObjectId;
  status: ConversationStatus;
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  unreadCountUser: number;
  unreadCountStaff: number;
  subject?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IChatConversationDocument extends IChatConversation, Document {}

// ─── Chat Message Interface ─────────────────────────────────────────────────

export interface IChatMessage {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  senderType: SenderType;
  type: MessageType;
  content: string;
  /** Original content before TFN redaction (encrypted, staff/admin only) */
  contentOriginal?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
}

export interface IChatMessageDocument extends IChatMessage, Document {}

// ─── Canned Response Interface ──────────────────────────────────────────────

export interface ICannedResponse {
  title: string;
  content: string;
  category: CannedResponseCategory;
  createdBy: Types.ObjectId;
  isGlobal: boolean;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICannedResponseDocument extends ICannedResponse, Document {}

// ─── Config ─────────────────────────────────────────────────────────────────

export interface ChatEngineConfig {
  /** Encryption key for contentOriginal (AES-256-GCM) */
  encryptionKey: string;
  /** Archive conversations after N years (default 2) */
  archiveAfterYears?: number;
}

// ─── Route Dependencies ─────────────────────────────────────────────────────

export interface ChatEngineRouteDeps {
  ConversationModel: import('mongoose').Model<IChatConversationDocument>;
  MessageModel: import('mongoose').Model<IChatMessageDocument>;
  CannedResponseModel: import('mongoose').Model<ICannedResponseDocument>;
  authenticate: import('express').RequestHandler;
  checkPermission: (...args: unknown[]) => import('express').RequestHandler;
  auditLog: {
    log: (entry: Record<string, unknown>) => Promise<void>;
    logFromRequest: import('express').RequestHandler;
  };
  config: ChatEngineConfig;
}

// ─── Socket.io Events ───────────────────────────────────────────────────────

export interface ServerToClientEvents {
  new_message: (payload: { conversationId: string; message: IChatMessage }) => void;
  message_read: (payload: { conversationId: string; messageId: string; readAt: Date }) => void;
  typing_indicator: (payload: { conversationId: string; userId: string; isTyping: boolean }) => void;
  conversation_resolved: (payload: { conversationId: string }) => void;
  staff_presence: (payload: { staffId: string; online: boolean }) => void;
}

export interface ClientToServerEvents {
  typing_indicator: (payload: { conversationId: string }) => void;
  join_conversation: (payload: { conversationId: string }) => void;
  leave_conversation: (payload: { conversationId: string }) => void;
}
