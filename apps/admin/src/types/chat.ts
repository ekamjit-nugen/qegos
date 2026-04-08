export type ConversationStatus = 'active' | 'resolved' | 'archived';

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  active: 'Active',
  resolved: 'Resolved',
  archived: 'Archived',
};

export const CONVERSATION_STATUS_COLORS: Record<ConversationStatus, string> = {
  active: 'green',
  resolved: 'blue',
  archived: 'default',
};

export interface Conversation {
  _id: string;
  userId: string;
  staffId: string;
  orderId?: string;
  status: ConversationStatus;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  unreadCountUser: number;
  unreadCountStaff: number;
  subject?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationListQuery {
  page?: number;
  limit?: number;
  status?: ConversationStatus;
}
