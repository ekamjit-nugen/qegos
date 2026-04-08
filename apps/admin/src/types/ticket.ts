export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export type TicketStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'waiting_on_client'
  | 'waiting_on_ato'
  | 'escalated'
  | 'resolved'
  | 'closed';

export type TicketCategory =
  | 'general'
  | 'tax_return'
  | 'refund'
  | 'document'
  | 'billing'
  | 'technical'
  | 'complaint'
  | 'other';

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  waiting_on_client: 'Waiting on Client',
  waiting_on_ato: 'Waiting on ATO',
  escalated: 'Escalated',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  open: 'blue',
  assigned: 'cyan',
  in_progress: 'processing',
  waiting_on_client: 'orange',
  waiting_on_ato: 'purple',
  escalated: 'red',
  resolved: 'green',
  closed: 'default',
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

export const TICKET_PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: 'default',
  normal: 'blue',
  high: 'orange',
  urgent: 'red',
};

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  general: 'General',
  tax_return: 'Tax Return',
  refund: 'Refund',
  document: 'Document',
  billing: 'Billing',
  technical: 'Technical',
  complaint: 'Complaint',
  other: 'Other',
};

export interface TicketMessage {
  senderId: string;
  senderType: 'client' | 'staff' | 'system';
  content: string;
  attachments?: string[];
  isInternal?: boolean;
  createdAt?: string;
}

export interface SupportTicket {
  _id: string;
  ticketNumber: string;
  userId: string;
  orderId?: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  description?: string;
  source?: string;
  assignedTo?: string;
  escalatedTo?: string;
  messages?: TicketMessage[];
  slaDeadline?: string;
  slaBreached: boolean;
  resolvedAt?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketListQuery {
  page?: number;
  limit?: number;
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
  search?: string;
}
