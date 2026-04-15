import type { Document, Types } from 'mongoose';

// ─── Enums / Unions ─────────────────────────────────────────────────────────

export type TicketStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'waiting_on_client'
  | 'waiting_on_ato'
  | 'escalated'
  | 'resolved'
  | 'closed';

export const TICKET_STATUSES: TicketStatus[] = [
  'open', 'assigned', 'in_progress', 'waiting_on_client',
  'waiting_on_ato', 'escalated', 'resolved', 'closed',
];

/** Valid status transitions */
export const TICKET_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ['assigned', 'in_progress', 'escalated', 'closed'],
  assigned: ['in_progress', 'waiting_on_client', 'waiting_on_ato', 'escalated', 'resolved', 'closed'],
  in_progress: ['waiting_on_client', 'waiting_on_ato', 'escalated', 'resolved'],
  waiting_on_client: ['in_progress', 'resolved', 'closed'],
  waiting_on_ato: ['in_progress', 'resolved'],
  escalated: ['in_progress', 'resolved', 'closed'],
  resolved: ['closed', 'open'], // reopen goes back to open
  closed: [], // terminal
};

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export const TICKET_PRIORITIES: TicketPriority[] = ['low', 'normal', 'high', 'urgent'];

export type TicketCategory =
  | 'billing_query'
  | 'refund_request'
  | 'return_status'
  | 'document_issue'
  | 'staff_complaint'
  | 'technical_issue'
  | 'deadline_concern'
  | 'ato_query'
  | 'general_enquiry'
  | 'amendment_request';

export const TICKET_CATEGORIES: TicketCategory[] = [
  'billing_query', 'refund_request', 'return_status', 'document_issue',
  'staff_complaint', 'technical_issue', 'deadline_concern', 'ato_query',
  'general_enquiry', 'amendment_request',
];

export type TicketSource =
  | 'chat' | 'whatsapp' | 'phone' | 'email' | 'portal' | 'walk_in' | 'admin_created';

export const TICKET_SOURCES: TicketSource[] = [
  'chat', 'whatsapp', 'phone', 'email', 'portal', 'walk_in', 'admin_created',
];

export type ResolutionCategory =
  | 'resolved_as_expected'
  | 'refund_issued'
  | 'correction_made'
  | 'escalated_to_ato'
  | 'client_error'
  | 'system_error'
  | 'no_action_needed';

export const RESOLUTION_CATEGORIES: ResolutionCategory[] = [
  'resolved_as_expected', 'refund_issued', 'correction_made',
  'escalated_to_ato', 'client_error', 'system_error', 'no_action_needed',
];

export type MessageSenderType = 'client' | 'staff' | 'system';

// ─── SLA Configuration (TKT-INV-01) ────────────────────────────────────────

export interface SlaConfig {
  firstResponseMinutes: number;
  resolutionMinutes: number;
  escalationTriggerMinutes: number;
}

/** SLA deadlines by priority (in business minutes) */
export const SLA_BY_PRIORITY: Record<TicketPriority, SlaConfig> = {
  urgent: { firstResponseMinutes: 60, resolutionMinutes: 240, escalationTriggerMinutes: 30 },
  high: { firstResponseMinutes: 240, resolutionMinutes: 480, escalationTriggerMinutes: 240 },
  normal: { firstResponseMinutes: 480, resolutionMinutes: 1440, escalationTriggerMinutes: 720 },
  low: { firstResponseMinutes: 1440, resolutionMinutes: 2880, escalationTriggerMinutes: 1440 },
};

export const MAX_REOPENS = 3;

// ─── Ticket Message Sub-Document ────────────────────────────────────────────

export interface ITicketMessage {
  senderId: Types.ObjectId;
  senderType: MessageSenderType;
  content: string;
  attachments?: string[];
  isInternal: boolean;
  createdAt: Date;
}

// ─── Support Ticket Interface ───────────────────────────────────────────────

export interface ISupportTicket {
  ticketNumber: string;
  userId: Types.ObjectId;
  orderId?: Types.ObjectId;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  description: string;
  /**
   * TKT-INV-02: For `staff_complaint` tickets, the staff member being
   * complained about. `assignTicket` rejects assignments to this user so
   * complaints never route to the subject of the complaint.
   */
  subjectStaffId?: Types.ObjectId;
  assignedTo?: Types.ObjectId;
  escalatedTo?: Types.ObjectId;
  escalatedAt?: Date;
  escalationReason?: string;
  resolution?: string;
  resolutionCategory?: ResolutionCategory;
  clientSatisfaction?: number;
  slaDeadline: Date;
  slaBreached: boolean;
  slaBreachedAt?: Date;
  messages: ITicketMessage[];
  relatedTicketIds?: Types.ObjectId[];
  source: TicketSource;
  firstResponseAt?: Date;
  firstResponseBreached: boolean;
  resolvedAt?: Date;
  closedAt?: Date;
  reopenCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISupportTicketDocument extends ISupportTicket, Document {}

// ─── Config ─────────────────────────────────────────────────────────────────

export interface SupportTicketsConfig {
  /** Business hours start (0-23, default 9) */
  businessHoursStart?: number;
  /** Business hours end (0-23, default 17) */
  businessHoursEnd?: number;
  /** Tax season extended hours start (default 8) */
  taxSeasonStart?: number;
  /** Tax season extended hours end (default 20) */
  taxSeasonEnd?: number;
  /** Tax season months 0-indexed (default [6,7,8,9] = Jul-Oct) */
  taxSeasonMonths?: number[];
}

// ─── Route Dependencies ─────────────────────────────────────────────────────

export interface SupportTicketsRouteDeps {
  TicketModel: import('mongoose').Model<ISupportTicketDocument>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mongoose Model<T> invariance; app passes Model<ICounterDocument>
  CounterModel: import('mongoose').Model<any>;
  authenticate: import('express').RequestHandler;
  checkPermission: import('@nugen/rbac').CheckPermissionFn;
  auditLog: import('@nugen/audit-log').AuditLogDI;
  config?: SupportTicketsConfig;
}
