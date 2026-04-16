/**
 * Saga / compensating-transaction primitive (GAP-C03).
 *
 * Every multi-step money-path flow in QEGOS — Pay Now, refund, order
 * conversion, credit award + notification — has the same problem:
 *
 *   1. Step A succeeds (credits deducted)
 *   2. Step B fails  (promo increment errors)
 *   3. We're left with credits gone + order still unpaid.
 *
 * The cure is the saga pattern: each forward step pairs with a
 * compensating step. If any forward fails, we run the compensations of
 * all PREVIOUSLY-COMPLETED steps in reverse order to roll back the
 * accumulated state.
 *
 * Scope of this primitive:
 *
 * - In-process saga only (no durable persistence). If the process dies
 *   mid-saga, neither forward nor compensation runs are guaranteed.
 *   That's acceptable for QEGOS today because every saga step writes
 *   to the same Mongo connection, so a process crash leaves at most
 *   one orphaned mutation that the next reconciliation cron sweeps up.
 * - Compensations are best-effort. The saga does NOT retry them. If a
 *   compensation fails, it's logged with `manual reconciliation
 *   required` and surfaced via SagaCompensationError so the caller can
 *   enqueue a dead-letter job. (We chose this over auto-retry because
 *   the right retry strategy depends heavily on the underlying op —
 *   refunding credits vs. cancelling a Stripe intent have different
 *   safe-retry semantics.)
 *
 * What goes in a saga:
 *
 * - Steps that mutate user-visible state (money, credits, status).
 * - Steps where partial completion is worse than total failure.
 *
 * What does NOT belong in a saga:
 *
 * - Pure read-only operations (compute pricing, validate, fetch).
 * - Operations whose side effects are intrinsically idempotent and
 *   self-healing (publishing an event the consumer dedupes by ID).
 * - Calls to external systems with no compensating action available
 *   (e.g. once Stripe fires `charge.succeeded`, the money is moved —
 *   you can issue a refund but that's a separate compensating saga,
 *   not a step in the original).
 */

import { logger } from './logger';

export interface SagaStep<TCtx> {
  /** Human-readable name used in logs and SagaCompensationError messages. */
  name: string;
  /** Forward action — mutates state. */
  forward: (ctx: TCtx) => Promise<void>;
  /** Compensating action — reverses what `forward` did. Best-effort, not retried by the saga. */
  compensate: (ctx: TCtx) => Promise<void>;
}

/**
 * Thrown when one or more compensations fail after a forward error.
 * Callers should treat this as a manual-reconciliation signal — log,
 * alert, or enqueue a follow-up job that takes ownership of fixing
 * the surviving partial state.
 */
export class SagaCompensationError extends Error {
  constructor(
    public readonly sagaName: string,
    public readonly originalError: Error,
    public readonly compensationFailures: ReadonlyArray<{ step: string; error: Error }>,
  ) {
    super(
      `Saga "${sagaName}" forward failed: ${originalError.message}. ` +
        `${compensationFailures.length} compensation(s) also failed: ` +
        compensationFailures.map((f) => `${f.step}=${f.error.message}`).join(', '),
    );
    this.name = 'SagaCompensationError';
  }
}

/**
 * Execute a sequence of compensating-transaction steps.
 *
 * If a forward step throws, every previously-completed step's `compensate`
 * runs in REVERSE order. Compensation failures are aggregated and surfaced
 * as a SagaCompensationError. The original forward error is re-thrown if
 * all compensations succeed.
 */
export async function runSaga<TCtx>(
  sagaName: string,
  steps: ReadonlyArray<SagaStep<TCtx>>,
  ctx: TCtx,
): Promise<void> {
  const completed: Array<SagaStep<TCtx>> = [];

  try {
    for (const step of steps) {
      await step.forward(ctx);
      completed.push(step);
    }
    logger.debug('Saga completed successfully', { saga: sagaName, steps: steps.length });
  } catch (forwardError) {
    const err = forwardError instanceof Error ? forwardError : new Error(String(forwardError));
    logger.error('Saga forward step failed — running compensations', {
      saga: sagaName,
      completedSteps: completed.length,
      totalSteps: steps.length,
      error: err.message,
    });

    // Compensate in reverse order. Continue compensating even if one fails,
    // so we roll back as much as we can — every compensation is independent.
    const compensationFailures: Array<{ step: string; error: Error }> = [];
    for (const step of [...completed].reverse()) {
      try {
        await step.compensate(ctx);
        logger.info('Saga step compensated', { saga: sagaName, step: step.name });
      } catch (compensateError) {
        const cErr =
          compensateError instanceof Error ? compensateError : new Error(String(compensateError));
        compensationFailures.push({ step: step.name, error: cErr });
        logger.error('Saga compensation failed — manual reconciliation required', {
          saga: sagaName,
          step: step.name,
          error: cErr.message,
        });
      }
    }

    if (compensationFailures.length > 0) {
      throw new SagaCompensationError(sagaName, err, compensationFailures);
    }
    throw err;
  }
}
