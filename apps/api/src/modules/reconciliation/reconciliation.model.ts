import { Schema, type Connection, type Model } from 'mongoose';
import type { IReconciliationItemDocument, ReconciliationStatus } from './reconciliation.types';
import { RECONCILIATION_STATUSES } from './reconciliation.types';

const compensationFailureSchema = new Schema(
  {
    step: { type: String, required: true },
    message: { type: String, required: true },
    name: { type: String },
    stack: { type: String },
  },
  { _id: false },
);

const originalErrorSchema = new Schema(
  {
    message: { type: String, required: true },
    name: { type: String },
    stack: { type: String },
  },
  { _id: false },
);

const reconciliationItemSchema = new Schema<IReconciliationItemDocument>(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    sagaName: { type: String, required: true, index: true },
    originalError: { type: originalErrorSchema, required: true },
    compensationFailures: { type: [compensationFailureSchema], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: RECONCILIATION_STATUSES as readonly ReconciliationStatus[],
      default: 'pending',
      index: true,
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    resolution: { type: String },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

// Common admin queries: list pending tickets, list by saga, list recent.
reconciliationItemSchema.index({ status: 1, createdAt: -1 });
reconciliationItemSchema.index({ sagaName: 1, createdAt: -1 });

export function createReconciliationItemModel(
  connection: Connection,
): Model<IReconciliationItemDocument> {
  return connection.model<IReconciliationItemDocument>(
    'ReconciliationItem',
    reconciliationItemSchema,
  );
}

/**
 * Generate the next ticket number (QGS-RC-XXXX zero-padded). Cheap query
 * — reads the most recent ticket and increments. Race-prone under
 * concurrent enqueue, so the unique index on ticketNumber is the
 * authoritative gate; on collision the caller should retry once.
 */
export async function generateTicketNumber(
  ReconciliationItemModel: Model<IReconciliationItemDocument>,
): Promise<string> {
  const last = await ReconciliationItemModel.findOne({}, { ticketNumber: 1 })
    .sort({ createdAt: -1 })
    .lean<{ ticketNumber: string } | null>();

  let nextNum = 1;
  if (last?.ticketNumber) {
    const match = last.ticketNumber.match(/QGS-RC-(\d+)/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }
  return `QGS-RC-${String(nextNum).padStart(4, '0')}`;
}
