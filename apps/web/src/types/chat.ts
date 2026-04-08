export interface Conversation {
  _id: string;
  userId: string;
  staffId?: string;
  orderId?: string;
  status: 'active' | 'resolved' | 'archived';
  lastMessageAt?: string;
  lastMessagePreview?: string;
  unreadCountUser: number;
  subject?: string;
  createdAt: string;
}

export interface ChatMessage {
  _id: string;
  conversationId: string;
  senderId: string;
  senderType: 'client' | 'staff' | 'system';
  type: 'text' | 'file' | 'system_event';
  content: string;
  fileUrl?: string;
  fileName?: string;
  isRead: boolean;
  createdAt: string;
}
