/**
 * Saga primitive — unit tests.
 *
 * Pins the contract callers will rely on:
 *   1. Forward steps run in order.
 *   2. On forward failure, only PREVIOUSLY-COMPLETED steps compensate
 *      (the failing step itself does not — it never finished).
 *   3. Compensations run in REVERSE order.
 *   4. Compensation failures don't stop later compensations.
 *   5. If all compensations succeed, the original error is re-thrown.
 *   6. If any compensation fails, a SagaCompensationError aggregates them.
 */

import { runSaga, SagaCompensationError, type SagaStep } from '../src/lib/saga';

describe('runSaga', () => {
  it('runs forward steps in order and does not compensate on success', async () => {
    const order: string[] = [];
    const steps: SagaStep<void>[] = [
      {
        name: 'a',
        forward: async () => {
          order.push('forward:a');
        },
        compensate: async () => {
          order.push('compensate:a');
        },
      },
      {
        name: 'b',
        forward: async () => {
          order.push('forward:b');
        },
        compensate: async () => {
          order.push('compensate:b');
        },
      },
    ];

    await runSaga('happy-path', steps, undefined);
    expect(order).toEqual(['forward:a', 'forward:b']);
  });

  it('compensates ONLY previously-completed steps when a forward fails', async () => {
    const order: string[] = [];
    const steps: SagaStep<void>[] = [
      {
        name: 'a',
        forward: async () => {
          order.push('forward:a');
        },
        compensate: async () => {
          order.push('compensate:a');
        },
      },
      {
        name: 'b',
        forward: async () => {
          order.push('forward:b');
        },
        compensate: async () => {
          order.push('compensate:b');
        },
      },
      {
        name: 'c',
        forward: async () => {
          order.push('forward:c-attempt');
          throw new Error('c blew up');
        },
        compensate: async () => {
          order.push('compensate:c'); // SHOULD NOT RUN — c never completed
        },
      },
      {
        name: 'd',
        forward: async () => {
          order.push('forward:d'); // SHOULD NOT RUN — c failed first
        },
        compensate: async () => {
          order.push('compensate:d');
        },
      },
    ];

    await expect(runSaga('partial-failure', steps, undefined)).rejects.toThrow('c blew up');

    // Forwards: a, b, c-attempt. Then compensations of completed (a, b) in REVERSE.
    expect(order).toEqual([
      'forward:a',
      'forward:b',
      'forward:c-attempt',
      'compensate:b',
      'compensate:a',
    ]);
  });

  it('continues compensating later steps even if one compensation fails', async () => {
    const order: string[] = [];
    const steps: SagaStep<void>[] = [
      {
        name: 'a',
        forward: async () => {
          order.push('forward:a');
        },
        compensate: async () => {
          order.push('compensate:a');
        },
      },
      {
        name: 'b',
        forward: async () => {
          order.push('forward:b');
        },
        compensate: async () => {
          order.push('compensate:b-fail');
          throw new Error('b compensation broken');
        },
      },
      {
        name: 'c',
        forward: async () => {
          throw new Error('c failed');
        },
        compensate: async () => {
          /* never reached */
        },
      },
    ];

    let caught: Error | undefined;
    try {
      await runSaga('compensation-resilience', steps, undefined);
    } catch (err) {
      caught = err as Error;
    }

    // Both compensations attempted in reverse, even though b's threw.
    expect(order).toEqual(['forward:a', 'forward:b', 'compensate:b-fail', 'compensate:a']);
    expect(caught).toBeInstanceOf(SagaCompensationError);
    const sce = caught as SagaCompensationError;
    expect(sce.sagaName).toBe('compensation-resilience');
    expect(sce.originalError.message).toBe('c failed');
    expect(sce.compensationFailures).toHaveLength(1);
    expect(sce.compensationFailures[0].step).toBe('b');
    expect(sce.compensationFailures[0].error.message).toBe('b compensation broken');
  });

  it('passes ctx through both forward and compensate', async () => {
    interface Ctx {
      forwardSeen: string[];
      compensateSeen: string[];
    }
    const ctx: Ctx = { forwardSeen: [], compensateSeen: [] };
    const steps: SagaStep<Ctx>[] = [
      {
        name: 'a',
        forward: async (c) => {
          c.forwardSeen.push('a');
        },
        compensate: async (c) => {
          c.compensateSeen.push('a');
        },
      },
      {
        name: 'b',
        forward: async (c) => {
          c.forwardSeen.push('b');
          throw new Error('boom');
        },
        compensate: async () => {
          /* not reached */
        },
      },
    ];

    await expect(runSaga('ctx-flow', steps, ctx)).rejects.toThrow('boom');
    expect(ctx.forwardSeen).toEqual(['a', 'b']);
    expect(ctx.compensateSeen).toEqual(['a']);
  });

  it('handles a saga with zero steps (no-op)', async () => {
    await expect(runSaga('empty', [], undefined)).resolves.toBeUndefined();
  });

  it('re-throws non-Error throwables as wrapped Error', async () => {
    const steps: SagaStep<void>[] = [
      {
        name: 'a',
        forward: async () => {
          // eslint-disable-next-line @typescript-eslint/no-throw-literal
          throw 'string failure';
        },
        compensate: async () => {
          /* not reached */
        },
      },
    ];

    await expect(runSaga('non-error-throw', steps, undefined)).rejects.toThrow('string failure');
  });
});
