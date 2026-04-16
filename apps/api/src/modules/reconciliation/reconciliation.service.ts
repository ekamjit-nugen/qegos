/**
 * Reconciliation queue — durable record of saga compensation failures.
 *
 * Why this exists:
 *
 *   When a money-path saga's forward step succeeds part-way and one of
 *   its compensations fails, the system is left in an inconsistent
 *   state: Stripe may have moved money, credits may have been issued
 *   but not deducted, the order may be in a half-flipped status. The
 *   route can't fix it (the compensation already failed once); only a
 *   human can.
 *
 *   The previous behaviour was: log severity='critical' and surface a
 *   generic 500 to the caller. Ops had to grep logs to find affected
 *   payments. This service replaces that grep with a queryable queue:
 *   every SagaCompensationError becomes one row keyed by a ticket
 *   number, with the original error, the failed compensations, and
 *   whatever context the saga site supplied (paymentId, orderId,
 *   userId, amounts).
 *
 *   The route handler can then return the ticket number to the client
 *   (typically an admin tool) so support knows what to reference. The
 *   admin reconciliation route lists pending tickets and lets a human
 *   mark them resolved or wont_fix with notes.
 *
 *   The queue is intentionally append-only on the failure path —
 *   enqueue is fire-and-await but its own errors do NOT shadow the
 *   saga error (the user-visible failure is still the saga, and we
 *   shouldn't lose that diagnostic in favour of a queue write error).
 */

import * as _auditLog from '@nugen/audit-log';
import { AppError } from '@nugen/error-handler';
import type { Model, FilterQuery } from 'mongoose';
import { Types } from 'mongoose';
import { getRequestId } from '../../lib/requestContext';
import type { SagaCompensationError } from '../../lib/saga';
import { generateTicketNumber } from './reconciliation.model';
import type { IReconciliationItemDocument, ReconciliationStatus } from './reconciliation.types';

const auditLog = {
  log: (params: Record<string, unknown>): void => {
    _auditLog.log({ ...params, requestId: getRequestId() } as never).catch(() => {
      // fire-and-forget: audit log failure is non-critical
    });
  },
};

export interface ReconciliationServiceDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ReconciliationItemModel: Model<any>;
}

export interface EnqueueResult {
  ticketId: string;
  ticketNumber: string;
}

export interface ListOptions {
  status?: ReconciliationStatus;
  sagaName?: string;
  page?: number;
  limit?: number;
}

export interface ListResult {
  items: IReconciliationItemDocument[];
  total: number;
  page: number;
  limit: number;
}

export interface ReconciliationServiceResult {
  /**
   * Persist a SagaCompensationError as a new pending ticket. Returns
   * the ticket id + number so the caller can include them in audit
   * logs and the response payload to the client.
   *
   * If the model write itself fails (Mongo unreachable, schema drift),
   * this still returns a synthetic ticketNumber so the caller has
   * SOMETHING to put in logs — but the audit log fires with severity
   * 'critical' so ops sees the queue-write failure too. Never throws
   * from the enqueue path; the saga error is the user-visible failure.
   */
  enqueue: (
    error: SagaCompensationError,
    metadata?: Record<string, unknown>,
  ) => Promise<EnqueueResult>;
  list: (opts?: ListOptions) => Promise<ListResult>;
  getById: (id: string) => Promise<IReconciliationItemDocument | null>;
  /**
   * Mark a ticket resolved. Records who resolved it + free-form notes.
   * Throws AppError.notFound if the ticket doesn't exist, or
   * AppError.badRequest if the ticket is already terminal.
   */
  resolve: (id: string, notes: string, actorId: string) => Promise<IReconciliationItemDocument>;
  /**
   * Mark a ticket wont_fix (e.g. data drift the team accepts as
   * known-bad). Same constraints as resolve.
   */
  wontFix: (id: string, notes: string, actorId: string) => Promise<IReconciliationItemDocument>;
}

const TERMINAL_STATUSES: ReconciliationStatus[] = ['resolved', 'wont_fix'];

export function createReconciliationService(
  deps: ReconciliationServiceDeps,
): ReconciliationServiceResult {
  const { ReconciliationItemModel } = deps;

  async function enqueue(
    error: SagaCompensationError,
    metadata: Record<string, unknown> = {},
  ): Promise<EnqueueResult> {
    let ticketNumber: string;
    try {
      ticketNumber = await generateTicketNumber(ReconciliationItemModel);
    } catch {
      // Counter read failed — fall back to a timestamp-based fallback so
      // the caller still has SOMETHING to reference. Real persistence
      // will fail in the next try block; we'll log and return a synthetic.
      ticketNumber = `QGS-RC-FALLBACK-${Date.now()}`;
    }

    try {
      const item = await ReconciliationItemModel.create({
        ticketNumber,
        sagaName: error.sagaName,
        originalError: {
          message: error.originalError.message,
          name: error.originalError.name,
          stack: error.originalError.stack,
        },
        compensationFailures: error.compensationFailures.map((f) => ({
          step: f.step,
          message: f.error.message,
          name: f.error.name,
          stack: f.error.stack,
        })),
        metadata,
        status: 'pending' as ReconciliationStatus,
      });

      auditLog.log({
        actor: 'system',
        actorType: 'system',
        action: 'create',
        resource: 'reconciliation',
        resourceId: String(item._id),
        severity: 'critical',
        description: `Reconciliation ticket ${ticketNumber} created for saga "${error.sagaName}": ${error.compensationFailures.length} compensation failure(s). Original error: ${error.originalError.message}`,
      });

      return { ticketId: String(item._id), ticketNumber };
    } catch (writeErr) {
      // Mongo write failed — this is bad (the saga failure is now only
      // captured in logs, no durable queue entry). Fire a critical
      // audit so ops sees the queue-write failure on top of the saga
      // failure. Return a synthetic ticket so the caller still has a
      // string to put in the response.
      const writeError = writeErr as Error;
      auditLog.log({
        actor: 'system',
        actorType: 'system',
        action: 'create',
        resource: 'reconciliation',
        resourceId: ticketNumber,
        severity: 'critical',
        description: `Reconciliation enqueue FAILED for saga "${error.sagaName}" (write error: ${writeError.message}). Original saga error: ${error.originalError.message}. MANUAL ACTION REQUIRED — no durable queue entry.`,
      });
      return { ticketId: '', ticketNumber };
    }
  }

  async function list(opts: ListOptions = {}): Promise<ListResult> {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const filter: FilterQuery<IReconciliationItemDocument> = {};
    if (opts.status) {
      filter.status = opts.status;
    }
    if (opts.sagaName) {
      filter.sagaName = opts.sagaName;
    }

    const [items, total] = await Promise.all([
      ReconciliationItemModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<IReconciliationItemDocument[]>(),
      ReconciliationItemModel.countDocuments(filter),
    ]);

    return { items, total, page, limit };
  }

  async function getById(id: string): Promise<IReconciliationItemDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return ReconciliationItemModel.findById(id).lean<IReconciliationItemDocument | null>();
  }

  async function transition(
    id: string,
    targetStatus: 'resolved' | 'wont_fix',
    notes: string,
    actorId: string,
  ): Promise<IReconciliationItemDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw AppError.notFound('ReconciliationItem');
    }
    const item = await ReconciliationItemModel.findById(id);
    if (!item) {
      throw AppError.notFound('ReconciliationItem');
    }
    if (TERMINAL_STATUSES.includes(item.status as ReconciliationStatus)) {
      throw AppError.badRequest(
        `Reconciliation ticket already in terminal status "${item.status}"; cannot transition to "${targetStatus}"`,
      );
    }

    item.status = targetStatus;
    item.resolution = notes;
    item.resolvedAt = new Date();
    item.assignedTo = new Types.ObjectId(actorId);
    await item.save();

    auditLog.log({
      actor: actorId,
      actorType: 'admin',
      action: 'update',
      resource: 'reconciliation',
      resourceId: String(item._id),
      severity: 'warning',
      description: `Reconciliation ticket ${item.ticketNumber} marked ${targetStatus} by ${actorId}: ${notes}`,
    });

    return item;
  }

  return {
    enqueue,
    list,
    getById,
    resolve: (id, notes, actorId) => transition(id, 'resolved', notes, actorId),
    wontFix: (id, notes, actorId) => transition(id, 'wont_fix', notes, actorId),
  };
}
