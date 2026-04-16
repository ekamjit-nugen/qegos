import type { Document, Types } from 'mongoose';

export const RECONCILIATION_STATUSES = ['pending', 'in_progress', 'resolved', 'wont_fix'] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

/**
 * One row per SagaCompensationError surfaced from a money-path saga.
 *
 * The forward step succeeded part-way (Stripe moved money, credits
 * deducted), one or more compensations failed, and we need a human to
 * close the loop. This row is the durable trail: who fired what, what
 * survived, what context the saga was working with, and the resolution
 * once an admin signs off.
 */
export interface IReconciliationItem {
  /** Human-readable ticket id, format: QGS-RC-XXXX (zero-padded). */
  ticketNumber: string;
  /** Saga name from the originating runSaga call (e.g. "refund.domainSync"). */
  sagaName: string;
  /** The forward error that triggered the compensation pass. */
  originalError: {
    message: string;
    name?: string;
    stack?: string;
  };
  /** Per-step compensation failures captured from SagaCompensationError. */
  compensationFailures: Array<{
    step: string;
    message: string;
    name?: string;
    stack?: string;
  }>;
  /**
   * Saga-site-supplied breadcrumbs (paymentId, orderId, userId, amounts,
   * idempotencyKey…). The route knows what's relevant — we just persist
   * what it gives us so the resolver has enough to find the partial state.
   */
  metadata: Record<string, unknown>;
  status: ReconciliationStatus;
  /** Admin user who took ownership (set when status moves out of 'pending'). */
  assignedTo?: Types.ObjectId;
  /** Resolution notes captured when the item moves to 'resolved' or 'wont_fix'. */
  resolution?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReconciliationItemDocument extends IReconciliationItem, Document {
  _id: Types.ObjectId;
}
