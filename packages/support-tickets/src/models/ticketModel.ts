import { Schema, type Connection, type Model } from 'mongoose';
import type {
  ISupportTicketDocument,
  TicketStatus,
  TicketPriority,
  TicketSource,
  MessageSenderType,
} from '../types';
import {
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  TICKET_CATEGORIES,
  TICKET_SOURCES,
  RESOLUTION_CATEGORIES,
} from '../types';

// ─── Ticket Number Generator ────────────────────────────────────────────────

let counterModel: Model<unknown> | null = null;

export function setCounterModel(model: Model<unknown>): void {
  counterModel = model;
}

async function generateTicketNumber(): Promise<string> {
  if (!counterModel) {
    // Fallback: timestamp-based
    return `QGS-TKT-${Date.now().toString(36).toUpperCase()}`;
  }
  const counter = await counterModel.findOneAndUpdate(
    { name: 'support_ticket' },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );
  const seq = (counter as unknown as { seq: number }).seq;
  return `QGS-TKT-${String(seq).padStart(4, '0')}`;
}

// ─── Sub-Schema: Ticket Message ─────────────────────────────────────────────

const ticketMessageSchema = new Schema(
  {
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderType: {
      type: String,
      required: true,
      enum: ['client', 'staff', 'system'] as MessageSenderType[],
    },
    content: { type: String, required: true },
    attachments: [{ type: String }],
    isInternal: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

// ─── Main Schema ────────────────────────────────────────────────────────────

const supportTicketSchema = new Schema<ISupportTicketDocument>(
  {
    ticketNumber: { type: String, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    category: {
      type: String,
      required: true,
      enum: TICKET_CATEGORIES,
    },
    priority: {
      type: String,
      required: true,
      enum: TICKET_PRIORITIES,
      default: 'normal' as TicketPriority,
    },
    status: {
      type: String,
      required: true,
      enum: TICKET_STATUSES,
      default: 'open' as TicketStatus,
    },
    subject: { type: String, required: true, maxlength: 200 },
    description: { type: String, required: true },
    // TKT-INV-02: staff the complaint is about (staff_complaint category)
    subjectStaffId: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    escalatedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    escalatedAt: { type: Date },
    escalationReason: { type: String },
    resolution: { type: String },
    resolutionCategory: {
      type: String,
      enum: RESOLUTION_CATEGORIES,
    },
    clientSatisfaction: { type: Number, min: 1, max: 5 },
    slaDeadline: { type: Date, required: true },
    slaBreached: { type: Boolean, default: false },
    slaBreachedAt: { type: Date },
    messages: [ticketMessageSchema],
    relatedTicketIds: [{ type: Schema.Types.ObjectId, ref: 'SupportTicket' }],
    source: {
      type: String,
      required: true,
      enum: TICKET_SOURCES,
      default: 'portal' as TicketSource,
    },
    firstResponseAt: { type: Date },
    firstResponseBreached: { type: Boolean, default: false },
    resolvedAt: { type: Date },
    closedAt: { type: Date },
    reopenCount: { type: Number, default: 0, max: 3 },
  },
  {
    timestamps: true,
    collection: 'support_tickets',
  },
);

// ─── Pre-save: Auto-generate ticket number ──────────────────────────────────

supportTicketSchema.pre('save', async function (next) {
  if (!this.ticketNumber) {
    this.ticketNumber = await generateTicketNumber();
  }
  next();
});

// ─── Indexes ────────────────────────────────────────────────────────────────

supportTicketSchema.index({ status: 1, priority: 1 });
supportTicketSchema.index({ assignedTo: 1, status: 1 });
supportTicketSchema.index({ slaBreached: 1, status: 1 });
supportTicketSchema.index({ category: 1 });
supportTicketSchema.index({ createdAt: -1 });

// Analytics: staffBenchmark aggregates resolved tickets by assignedTo
supportTicketSchema.index({ status: 1, resolvedAt: -1, assignedTo: 1 });

// ─── Factory ────────────────────────────────────────────────────────────────

export function createSupportTicketModel(
  connection: Connection,
): Model<ISupportTicketDocument> {
  if (connection.models.SupportTicket) {
    return connection.models.SupportTicket as Model<ISupportTicketDocument>;
  }
  return connection.model<ISupportTicketDocument>('SupportTicket', supportTicketSchema);
}
