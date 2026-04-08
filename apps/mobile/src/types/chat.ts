export interface Conversation {
  _id: string;
  subject: string;
  participants: ConversationParticipant[];
  lastMessage?: {
    body: string;
    senderId: string;
    sentAt: string;
  };
  unreadCount: number;
  status: 'open' | 'closed' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface ConversationParticipant {
  userId: string;
  name: string;
  role: 'client' | 'staff' | 'admin';
}

export interface ChatMessage {
  _id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: 'client' | 'staff' | 'admin';
  body: string;
  attachments: ChatAttachment[];
  readBy: string[];
  createdAt: string;
}

export interface ChatAttachment {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
}

export interface SendMessageRequest {
  conversationId: string;
  body: string;
}

export interface UnreadCount {
  total: number;
}
