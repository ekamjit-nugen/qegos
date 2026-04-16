import type { Model, Types } from 'mongoose';
import type {
  ISupportTicketDocument,
  TicketStatus,
  TicketPriority,
  TicketCategory,
  TicketSource,
  ResolutionCategory,
  MessageSenderType,
  ITicketMessage,
} from '../types';
import { TICKET_STATUS_TRANSITIONS, MAX_REOPENS } from '../types';
import {
  calculateSlaDeadline,
  calculateFirstResponseDeadline,
  isSlaBreached,
  isSlaImminent,
  getEscalationTriggerTime,
} from './slaEngine';

// ─── Module State ───────────────────────────────────────────────────────────

let TicketModel: Model<ISupportTicketDocument>;

export function initTicketService(ticketModel: Model<ISupportTicketDocument>): void {
  TicketModel = ticketModel;
}

// ─── Status Machine Validation ──────────────────────────────────────────────

export function isValidTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TICKET_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Create Ticket ──────────────────────────────────────────────────────────

export interface CreateTicketParams {
  userId: Types.ObjectId;
  orderId?: Types.ObjectId;
  category: TicketCategory;
  priority?: TicketPriority;
  subject: string;
  description: string;
  source?: TicketSource;
  assignedTo?: Types.ObjectId;
  subjectStaffId?: Types.ObjectId;
}

export async function createTicket(params: CreateTicketParams): Promise<ISupportTicketDocument> {
  const priority = params.priority ?? 'normal';
  const now = new Date();
  const slaDeadline = calculateSlaDeadline(now, priority);

  // TKT-INV-02: block creating a staff_complaint pre-assigned to its subject.
  if (
    params.category === 'staff_complaint' &&
    params.subjectStaffId &&
    params.assignedTo &&
    params.subjectStaffId.equals(params.assignedTo)
  ) {
    const err = new Error(
      'Cannot assign staff_complaint ticket to the staff member it is about',
    ) as Error & { statusCode: number; code: string };
    err.statusCode = 400;
    err.code = 'STAFF_COMPLAINT_SELF_ASSIGN';
    throw err;
  }

  const ticket = await TicketModel.create({
    userId: params.userId,
    orderId: params.orderId,
    category: params.category,
    priority,
    status: params.assignedTo ? 'assigned' : 'open',
    subject: params.subject,
    description: params.description,
    source: params.source ?? 'portal',
    assignedTo: params.assignedTo,
    subjectStaffId: params.subjectStaffId,
    slaDeadline,
    messages: [
      {
        senderId: params.userId,
        senderType: 'client' as MessageSenderType,
        content: params.description,
        isInternal: false,
        createdAt: now,
      },
    ],
  });

  return ticket;
}

// ─── Get Ticket ─────────────────────────────────────────────────────────────

export async function getTicket(
  ticketId: Types.ObjectId,
  options?: { filterInternal?: boolean },
): Promise<ISupportTicketDocument | null> {
  const ticket = await TicketModel.findById(ticketId);
  if (!ticket) {
    return null;
  }

  // TKT-INV-03: Filter internal messages for clients
  if (options?.filterInternal) {
    ticket.messages = ticket.messages.filter((m) => !m.isInternal);
  }

  return ticket;
}

// ─── List Tickets ───────────────────────────────────────────────────────────

export interface ListTicketsParams {
  status?: TicketStatus;
  category?: TicketCategory;
  priority?: TicketPriority;
  assignedTo?: Types.ObjectId;
  userId?: Types.ObjectId;
  slaBreached?: boolean;
  page?: number;
  limit?: number;
  /** TKT-INV-03: strip internal messages from each returned ticket (set for clients). */
  filterInternal?: boolean;
}

export async function listTickets(
  params: ListTicketsParams,
): Promise<{ tickets: ISupportTicketDocument[]; total: number; page: number; pages: number }> {
  const { page = 1, limit = 20, filterInternal, ...filters } = params;
  const query: Record<string, unknown> = {};

  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.category) {
    query.category = filters.category;
  }
  if (filters.priority) {
    query.priority = filters.priority;
  }
  if (filters.assignedTo) {
    query.assignedTo = filters.assignedTo;
  }
  if (filters.userId) {
    query.userId = filters.userId;
  }
  if (filters.slaBreached !== undefined) {
    query.slaBreached = filters.slaBreached;
  }

  const [tickets, total] = await Promise.all([
    TicketModel.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    TicketModel.countDocuments(query),
  ]);

  // TKT-INV-03: Clients must never see internal (staff-only) messages.
  if (filterInternal) {
    for (const t of tickets) {
      t.messages = t.messages.filter((m) => !m.isInternal);
    }
  }

  return { tickets, total, page, pages: Math.ceil(total / limit) };
}

// ─── Update Status (TKT-INV-07: every status change = AuditLog) ────────────

export async function updateTicketStatus(
  ticketId: Types.ObjectId,
  newStatus: TicketStatus,
): Promise<ISupportTicketDocument | null> {
  const ticket = await TicketModel.findById(ticketId);
  if (!ticket) {
    return null;
  }

  if (!isValidTransition(ticket.status, newStatus)) {
    const err = new Error(`Invalid transition: ${ticket.status} → ${newStatus}`) as Error & {
      statusCode: number;
      code: string;
    };
    err.statusCode = 400;
    err.code = 'INVALID_TRANSITION';
    throw err;
  }

  ticket.status = newStatus;
  if (newStatus === 'resolved') {
    ticket.resolvedAt = new Date();
  }
  if (newStatus === 'closed') {
    ticket.closedAt = new Date();
  }

  await ticket.save();
  return ticket;
}

// ─── Assign Ticket (TKT-INV-02: staff_complaint never to complained-about) ──

export async function assignTicket(
  ticketId: Types.ObjectId,
  staffId: Types.ObjectId,
): Promise<ISupportTicketDocument | null> {
  const ticket = await TicketModel.findById(ticketId);
  if (!ticket) {
    return null;
  }

  // TKT-INV-02: a staff_complaint must never be routed to the staff member
  // it is about. Enforced here — callers cannot forget.
  if (
    ticket.category === 'staff_complaint' &&
    ticket.subjectStaffId &&
    ticket.subjectStaffId.equals(staffId)
  ) {
    const err = new Error(
      'Cannot assign staff_complaint ticket to the staff member it is about',
    ) as Error & { statusCode: number; code: string };
    err.statusCode = 400;
    err.code = 'STAFF_COMPLAINT_SELF_ASSIGN';
    throw err;
  }

  ticket.assignedTo = staffId;
  if (ticket.status === 'open') {
    ticket.status = 'assigned';
  }

  await ticket.save();
  return ticket;
}

// ─── Add Message (TKT-INV-03: internal msgs hidden from client) ─────────────

export async function addMessage(
  ticketId: Types.ObjectId,
  message: {
    senderId: Types.ObjectId;
    senderType: MessageSenderType;
    content: string;
    attachments?: string[];
    isInternal?: boolean;
  },
): Promise<ISupportTicketDocument | null> {
  const ticket = await TicketModel.findById(ticketId);
  if (!ticket) {
    return null;
  }

  ticket.messages.push({
    senderId: message.senderId,
    senderType: message.senderType,
    content: message.content,
    attachments: message.attachments,
    isInternal: message.isInternal ?? false,
    createdAt: new Date(),
  } as ITicketMessage);

  // Track first response
  if (message.senderType === 'staff' && !ticket.firstResponseAt) {
    ticket.firstResponseAt = new Date();
  }

  await ticket.save();
  return ticket;
}

// ─── Escalate Ticket ────────────────────────────────────────────────────────

export async function escalateTicket(
  ticketId: Types.ObjectId,
  escalatedTo: Types.ObjectId,
  reason: string,
): Promise<ISupportTicketDocument | null> {
  const ticket = await TicketModel.findById(ticketId);
  if (!ticket) {
    return null;
  }

  ticket.status = 'escalated';
  ticket.escalatedTo = escalatedTo;
  ticket.escalatedAt = new Date();
  ticket.escalationReason = reason;

  // Add system message
  ticket.messages.push({
    senderId: escalatedTo,
    senderType: 'system',
    content: `Ticket escalated. Reason: ${reason}`,
    isInternal: true,
    createdAt: new Date(),
  } as ITicketMessage);

  await ticket.save();
  return ticket;
}

// ─── Resolve Ticket ─────────────────────────────────────────────────────────

export async function resolveTicket(
  ticketId: Types.ObjectId,
  resolution: string,
  resolutionCategory: ResolutionCategory,
): Promise<ISupportTicketDocument | null> {
  const ticket = await TicketModel.findById(ticketId);
  if (!ticket) {
    return null;
  }

  if (!isValidTransition(ticket.status, 'resolved')) {
    const err = new Error(`Cannot resolve ticket in ${ticket.status} status`) as Error & {
      statusCode: number;
      code: string;
    };
    err.statusCode = 400;
    err.code = 'INVALID_TRANSITION';
    throw err;
  }

  ticket.status = 'resolved';
  ticket.resolution = resolution;
  ticket.resolutionCategory = resolutionCategory;
  ticket.resolvedAt = new Date();

  await ticket.save();
  return ticket;
}

// ─── Reopen Ticket (TKT-INV-06: max 3 reopens) ────────────────────────────

export async function reopenTicket(
  ticketId: Types.ObjectId,
): Promise<ISupportTicketDocument | null> {
  const ticket = await TicketModel.findById(ticketId);
  if (!ticket) {
    return null;
  }

  if (ticket.status !== 'resolved') {
    const err = new Error('Only resolved tickets can be reopened') as Error & {
      statusCode: number;
      code: string;
    };
    err.statusCode = 400;
    err.code = 'INVALID_TRANSITION';
    throw err;
  }

  if (ticket.reopenCount >= MAX_REOPENS) {
    const err = new Error(
      `Maximum reopens (${MAX_REOPENS}) reached. Please create a new ticket.`,
    ) as Error & {
      statusCode: number;
      code: string;
    };
    err.statusCode = 400;
    err.code = 'MAX_REOPENS_REACHED';
    throw err;
  }

  ticket.status = 'open';
  ticket.reopenCount += 1;
  ticket.resolvedAt = undefined;

  ticket.messages.push({
    senderId: ticket.userId,
    senderType: 'system',
    content: `Ticket reopened (${ticket.reopenCount}/${MAX_REOPENS})`,
    isInternal: false,
    createdAt: new Date(),
  } as ITicketMessage);

  await ticket.save();
  return ticket;
}

// ─── Client Satisfaction ────────────────────────────────────────────────────

export async function rateSatisfaction(
  ticketId: Types.ObjectId,
  rating: number,
): Promise<ISupportTicketDocument | null> {
  return TicketModel.findByIdAndUpdate(
    ticketId,
    { $set: { clientSatisfaction: rating } },
    { new: true },
  );
}

// ─── Stats Dashboard ────────────────────────────────────────────────────────

export interface TicketStats {
  open: number;
  inProgress: number;
  resolved: number;
  breached: number;
  avgResolutionMinutes: number;
  avgSatisfaction: number;
  byCategory: Array<{ category: string; count: number }>;
  byStaff: Array<{ staffId: Types.ObjectId; count: number; breached: number }>;
}

export async function getTicketStats(): Promise<TicketStats> {
  const [statusCounts, breachedCount, avgRes, avgSat, byCategory, byStaff] = await Promise.all([
    TicketModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    TicketModel.countDocuments({ slaBreached: true }),
    TicketModel.aggregate([
      { $match: { resolvedAt: { $exists: true } } },
      {
        $project: {
          resolutionMs: { $subtract: ['$resolvedAt', '$createdAt'] },
        },
      },
      { $group: { _id: null, avg: { $avg: '$resolutionMs' } } },
    ]),
    TicketModel.aggregate([
      { $match: { clientSatisfaction: { $exists: true } } },
      { $group: { _id: null, avg: { $avg: '$clientSatisfaction' } } },
    ]),
    TicketModel.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $project: { _id: 0, category: '$_id', count: 1 } },
    ]),
    TicketModel.aggregate([
      { $match: { assignedTo: { $exists: true } } },
      {
        $group: {
          _id: '$assignedTo',
          count: { $sum: 1 },
          breached: { $sum: { $cond: ['$slaBreached', 1, 0] } },
        },
      },
      { $project: { _id: 0, staffId: '$_id', count: 1, breached: 1 } },
    ]),
  ]);

  const getStatusCount = (s: string): number =>
    (statusCounts.find((c: { _id: string; count: number }) => c._id === s)?.count as number) ?? 0;

  return {
    open: getStatusCount('open') + getStatusCount('assigned'),
    inProgress:
      getStatusCount('in_progress') +
      getStatusCount('waiting_on_client') +
      getStatusCount('waiting_on_ato') +
      getStatusCount('escalated'),
    resolved: getStatusCount('resolved') + getStatusCount('closed'),
    breached: breachedCount,
    avgResolutionMinutes: avgRes[0] ? Math.round((avgRes[0].avg as number) / 60_000) : 0,
    avgSatisfaction: avgSat[0] ? Math.round((avgSat[0].avg as number) * 100) / 100 : 0,
    byCategory,
    byStaff,
  };
}

// ─── SLA Cron Jobs (TKT-INV-04: every 5 min, cannot be silenced) ───────────

/**
 * Check all open tickets for SLA breaches and imminent breaches.
 * Returns arrays for the caller to handle notifications.
 */
export async function checkSlaBreaches(): Promise<{
  breached: ISupportTicketDocument[];
  imminent: ISupportTicketDocument[];
  unassignedUrgent: ISupportTicketDocument[];
}> {
  const now = new Date();

  const openTickets = await TicketModel.find({
    status: { $nin: ['resolved', 'closed'] },
  });

  const breached: ISupportTicketDocument[] = [];
  const imminent: ISupportTicketDocument[] = [];
  const unassignedUrgent: ISupportTicketDocument[] = [];

  for (const ticket of openTickets) {
    // SLA breach check
    if (!ticket.slaBreached && isSlaBreached(ticket.slaDeadline, now)) {
      ticket.slaBreached = true;
      ticket.slaBreachedAt = now;
      await ticket.save();
      breached.push(ticket);
    }

    // Imminent breach (80% elapsed)
    if (!ticket.slaBreached && isSlaImminent(ticket.createdAt, ticket.slaDeadline, now)) {
      imminent.push(ticket);
    }

    // First response breach
    if (!ticket.firstResponseAt && !ticket.firstResponseBreached) {
      // Check first response SLA based on priority (uses `firstResponseMinutes`,
      // NOT `escalationTriggerMinutes` which is for unassigned-urgent routing)
      const frDeadline = calculateFirstResponseDeadline(ticket.createdAt, ticket.priority);
      if (now.getTime() > frDeadline.getTime()) {
        ticket.firstResponseBreached = true;
        await ticket.save();
      }
    }

    // Unassigned urgent > 30 min
    if (ticket.priority === 'urgent' && !ticket.assignedTo) {
      const triggerTime = getEscalationTriggerTime(ticket.createdAt, 'urgent');
      if (now.getTime() > triggerTime.getTime()) {
        unassignedUrgent.push(ticket);
      }
    }
  }

  return { breached, imminent, unassignedUrgent };
}

/**
 * Auto-close tickets waiting on client for > 7 days (TKT-INV-05 analog).
 */
export async function autoCloseStaleTickets(): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const stale = await TicketModel.find({
    status: 'waiting_on_client',
    updatedAt: { $lte: sevenDaysAgo },
  });

  let closed = 0;
  for (const ticket of stale) {
    ticket.status = 'closed';
    ticket.closedAt = new Date();
    ticket.messages.push({
      senderId: ticket.userId,
      senderType: 'system',
      content: 'Ticket auto-closed after 7 days without client response.',
      isInternal: false,
      createdAt: new Date(),
    } as ITicketMessage);
    await ticket.save();
    closed++;
  }

  return closed;
}

/**
 * Auto-close resolved tickets after 7 days (TKT-INV-05).
 */
export async function autoCloseResolvedTickets(): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const result = await TicketModel.updateMany(
    {
      status: 'resolved',
      resolvedAt: { $lte: sevenDaysAgo },
    },
    {
      $set: { status: 'closed', closedAt: new Date() },
    },
  );

  return result.modifiedCount;
}
