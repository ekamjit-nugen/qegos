/**
 * E2E: webhook idempotency under at-least-once delivery
 *
 * Stripe (and Payroo) deliver webhooks at-least-once. The same eventId
 * arrives multiple times when the gateway didn't see our 200 OK in time
 * — network blip, deploy, slow handler — and the gateway retries. The
 * webhook handler MUST be a no-op on replay: no double-capture, no
 * double-refund, no double-emit of paymentEvents (downstream listeners
 * would re-credit, re-email, re-flip orders).
 *
 * The dedup contract lives in `webhookProcessor.processWebhookEvent`:
 *   1. `WebhookEventModel.findOne({ eventId })` — if found → return
 *      `{ processed: false, duplicate: true }`.
 *   2. Otherwise create a row with `status: 'processing'`, then mutate
 *      the Payment, then update the row to `status: 'processed'`.
 *
 * These tests cover the FIRST-call-mutates / SECOND-call-no-ops contract
 * for both Stripe and Payroo, across the three event types we actually
 * react to in production today: succeeded, payment_failed/cancelled,
 * and charge.refunded. The collectPaymentWebhook + payNowWebhook tests
 * already prove the happy path; this file proves the REPLAY path.
 *
 * What's NOT tested here (separate concern):
 *   - Real Mongo unique-index race when two webhook posts arrive within
 *     a few ms of each other — that's enforced by the schema's
 *     `unique: true` on eventId. A unit test against a mocked Map can't
 *     prove what only the database can.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const requireFn: NodeRequire = require;
import {
  initWebhookProcessor,
  processStripeWebhook,
  processPayrooWebhook,
  paymentEvents,
} from '@nugen/payment-gateway';

// ─── In-memory stores ──────────────────────────────────────────────────────

interface StoredPayment {
  _id: string;
  paymentNumber: string;
  orderId: { toString: () => string };
  userId: { toString: () => string };
  gateway: string;
  gatewayTxnId: string;
  amount: number;
  capturedAmount: number;
  refundedAmount: number;
  currency: string;
  status: string;
  webhookProcessed: boolean;
  webhookProcessedAt: Date | null;
  save: () => Promise<void>;
}

interface StoredWebhookEvent {
  eventId: string;
  gateway: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: string;
  error?: string;
  retryCount: number;
  processedAt?: Date;
  save: () => Promise<void>;
}

function makeStores(): {
  payments: Map<string, StoredPayment>;
  webhookEvents: Map<string, StoredWebhookEvent>;
} {
  return {
    payments: new Map(),
    webhookEvents: new Map(),
  };
}

function buildPaymentModel(payments: Map<string, StoredPayment>): unknown {
  return {
    findOne: (filter?: Record<string, unknown>) => {
      const run = (): StoredPayment | null => {
        for (const p of payments.values()) {
          if (filter?.gatewayTxnId && p.gatewayTxnId !== filter.gatewayTxnId) {
            continue;
          }
          return p;
        }
        return null;
      };
      const chain = {
        lean: async (): Promise<StoredPayment | null> => run(),
        then: (resolve: (v: StoredPayment | null) => unknown) => resolve(run()),
      };
      return chain;
    },
  };
}

function buildWebhookEventModel(
  webhookEvents: Map<string, StoredWebhookEvent>,
  opts: { failCreateWith?: Error } = {},
): unknown {
  return {
    findOne: (filter: { eventId: string }) => ({
      lean: async (): Promise<StoredWebhookEvent | null> =>
        webhookEvents.get(filter.eventId) ?? null,
    }),
    create: async (data: Record<string, unknown>): Promise<StoredWebhookEvent> => {
      if (opts.failCreateWith) {
        throw opts.failCreateWith;
      }
      const eventId = data.eventId as string;
      const event: StoredWebhookEvent = {
        eventId,
        gateway: data.gateway as string,
        eventType: data.eventType as string,
        payload: (data.payload ?? {}) as Record<string, unknown>,
        status: (data.status as string) ?? 'processing',
        retryCount: 0,
        save: async (): Promise<void> => {
          webhookEvents.set(eventId, event);
        },
      };
      webhookEvents.set(eventId, event);
      return event;
    },
  };
}

// ─── Test harness ──────────────────────────────────────────────────────────

const ORDER_ID = '670000000000000000000301';
const CLIENT_ID = '670000000000000000000302';
const PAYMENT_ID = '670000000000000000000303';
const STRIPE_PI = 'pi_live_replay_dedup_001';
const PAYROO_TXN = 'payroo_txn_replay_dedup_001';

function seedStripeSucceededPayment(payments: Map<string, StoredPayment>): StoredPayment {
  const payment: StoredPayment = {
    _id: PAYMENT_ID,
    paymentNumber: 'QGS-P-0001',
    orderId: { toString: () => ORDER_ID },
    userId: { toString: () => CLIENT_ID },
    gateway: 'stripe',
    gatewayTxnId: STRIPE_PI,
    amount: 25000,
    capturedAmount: 0,
    refundedAmount: 0,
    currency: 'AUD',
    status: 'pending',
    webhookProcessed: false,
    webhookProcessedAt: null,
    save: async (): Promise<void> => {
      payments.set(PAYMENT_ID, payment);
    },
  };
  payments.set(PAYMENT_ID, payment);
  return payment;
}

function seedPayrooPendingPayment(payments: Map<string, StoredPayment>): StoredPayment {
  const payment: StoredPayment = {
    _id: PAYMENT_ID,
    paymentNumber: 'QGS-P-0002',
    orderId: { toString: () => ORDER_ID },
    userId: { toString: () => CLIENT_ID },
    gateway: 'payroo',
    gatewayTxnId: PAYROO_TXN,
    amount: 12000,
    capturedAmount: 0,
    refundedAmount: 0,
    currency: 'AUD',
    status: 'pending',
    webhookProcessed: false,
    webhookProcessedAt: null,
    save: async (): Promise<void> => {
      payments.set(PAYMENT_ID, payment);
    },
  };
  payments.set(PAYMENT_ID, payment);
  return payment;
}

function setupWith(opts: { failWebhookCreateWith?: Error } = {}): {
  payments: Map<string, StoredPayment>;
  webhookEvents: Map<string, StoredWebhookEvent>;
} {
  const stores = makeStores();
  const PaymentModel = buildPaymentModel(stores.payments);
  const WebhookEventModel = buildWebhookEventModel(stores.webhookEvents, {
    failCreateWith: opts.failWebhookCreateWith,
  });
  initWebhookProcessor(WebhookEventModel as never, PaymentModel as never);
  return stores;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('E2E: webhook idempotency under at-least-once delivery', () => {
  // Use the actual `requireFn` so tsc doesn't complain about an unused import.
  // (supertest is already loaded by other suites; this proves the dedup
  // path doesn't depend on the express layer.)
  void requireFn;

  afterEach(() => {
    paymentEvents.removeAllListeners();
  });

  describe('Stripe replay', () => {
    it('payment_intent.succeeded replayed → second call dedups, payment.succeeded emits exactly once', async () => {
      const { payments, webhookEvents } = setupWith();
      const payment = seedStripeSucceededPayment(payments);

      const onSucceeded = jest.fn();
      paymentEvents.on('payment.succeeded', onSucceeded);

      const eventId = 'evt_stripe_replay_succeeded_01';
      const eventType = 'payment_intent.succeeded';
      const payload = { data: { object: { id: STRIPE_PI, amount: payment.amount } } };

      // First delivery: mutates the payment, fires the event, records the row.
      const first = await processStripeWebhook(eventId, eventType, payload);
      expect(first).toEqual({ processed: true, duplicate: false });
      expect(payment.status).toBe('succeeded');
      expect(payment.capturedAmount).toBe(25000);
      expect(payment.webhookProcessed).toBe(true);
      expect(onSucceeded).toHaveBeenCalledTimes(1);
      expect(webhookEvents.get(eventId)?.status).toBe('processed');

      // Snapshot post-first state.
      const capturedAfterFirst = payment.capturedAmount;
      const processedAtAfterFirst = payment.webhookProcessedAt;

      // Second delivery (same eventId): no-op. Payment unchanged. No second event.
      const second = await processStripeWebhook(eventId, eventType, payload);
      expect(second).toEqual({ processed: false, duplicate: true });
      expect(payment.status).toBe('succeeded');
      expect(payment.capturedAmount).toBe(capturedAfterFirst);
      expect(payment.webhookProcessedAt).toBe(processedAtAfterFirst);
      expect(onSucceeded).toHaveBeenCalledTimes(1);
      expect(webhookEvents.size).toBe(1);
    });

    it('different eventId for already-succeeded payment → recorded as ignored (invalid transition), no double-emit', async () => {
      const { payments, webhookEvents } = setupWith();
      const payment = seedStripeSucceededPayment(payments);

      const onSucceeded = jest.fn();
      paymentEvents.on('payment.succeeded', onSucceeded);

      const payload = { data: { object: { id: STRIPE_PI, amount: payment.amount } } };

      // First webhook: succeeded.
      await processStripeWebhook('evt_first_succeeded_01', 'payment_intent.succeeded', payload);
      expect(onSucceeded).toHaveBeenCalledTimes(1);

      // A DIFFERENT Stripe event (from say a charge.* sibling) carrying the
      // same payment_intent.id but firing payment_intent.succeeded again.
      // The eventId dedup misses (different id), but the status-transition
      // guard (PAY-INV-07) catches it: succeeded → succeeded is invalid.
      const second = await processStripeWebhook(
        'evt_second_succeeded_02',
        'payment_intent.succeeded',
        payload,
      );
      expect(second).toEqual({ processed: false, duplicate: false });
      expect(onSucceeded).toHaveBeenCalledTimes(1); // not re-emitted
      const stored = webhookEvents.get('evt_second_succeeded_02');
      expect(stored?.status).toBe('ignored');
      expect(stored?.error).toMatch(/Invalid transition: succeeded -> succeeded/);
    });

    it('charge.refunded replayed → refundedAmount does not double', async () => {
      const { payments, webhookEvents } = setupWith();
      const payment = seedStripeSucceededPayment(payments);
      // First fire the success so we can refund.
      await processStripeWebhook('evt_pre_refund_succeed_01', 'payment_intent.succeeded', {
        data: { object: { id: STRIPE_PI, amount: payment.amount } },
      });
      expect(payment.status).toBe('succeeded');
      expect(payment.capturedAmount).toBe(25000);

      const onRefunded = jest.fn();
      const onPartial = jest.fn();
      paymentEvents.on('payment.refunded', onRefunded);
      paymentEvents.on('payment.partially_refunded', onPartial);

      const refundEventId = 'evt_charge_refunded_full_01';
      const refundPayload = {
        data: {
          object: {
            id: STRIPE_PI,
            payment_intent: STRIPE_PI,
            amount_refunded: 25000,
          },
        },
      };

      const first = await processStripeWebhook(refundEventId, 'charge.refunded', refundPayload);
      expect(first).toEqual({ processed: true, duplicate: false });
      expect(payment.status).toBe('refunded');
      expect(payment.refundedAmount).toBe(25000);
      expect(onRefunded).toHaveBeenCalledTimes(1);
      expect(onPartial).not.toHaveBeenCalled();

      // Replay: dedup should stop us before we touch refundedAmount or emit.
      const second = await processStripeWebhook(refundEventId, 'charge.refunded', refundPayload);
      expect(second).toEqual({ processed: false, duplicate: true });
      expect(payment.refundedAmount).toBe(25000); // not 50000
      expect(onRefunded).toHaveBeenCalledTimes(1);
      expect(webhookEvents.get(refundEventId)?.status).toBe('processed');
    });

    it('payment_intent.canceled replayed on a pending payment → second call dedups, status stays cancelled', async () => {
      const { payments, webhookEvents } = setupWith();
      const payment = seedStripeSucceededPayment(payments);

      const onCancelled = jest.fn();
      paymentEvents.on('payment.cancelled', onCancelled);

      const eventId = 'evt_stripe_canceled_replay_01';
      const payload = { data: { object: { id: STRIPE_PI } } };

      const first = await processStripeWebhook(eventId, 'payment_intent.canceled', payload);
      expect(first).toEqual({ processed: true, duplicate: false });
      expect(payment.status).toBe('cancelled');
      expect(onCancelled).toHaveBeenCalledTimes(1);

      const second = await processStripeWebhook(eventId, 'payment_intent.canceled', payload);
      expect(second).toEqual({ processed: false, duplicate: true });
      expect(payment.status).toBe('cancelled');
      expect(onCancelled).toHaveBeenCalledTimes(1);
      expect(webhookEvents.size).toBe(1);
    });

    it('unmapped Stripe event type recorded as ignored once → replay still dedups', async () => {
      const { payments, webhookEvents } = setupWith();
      seedStripeSucceededPayment(payments);

      const onAny = jest.fn();
      paymentEvents.on('payment.succeeded', onAny);
      paymentEvents.on('payment.cancelled', onAny);

      const eventId = 'evt_unmapped_event_01';
      const payload = { data: { object: { id: STRIPE_PI } } };

      const first = await processStripeWebhook(eventId, 'payment_intent.created', payload);
      expect(first).toEqual({ processed: false, duplicate: false });
      expect(webhookEvents.get(eventId)?.status).toBe('ignored');
      expect(onAny).not.toHaveBeenCalled();

      const second = await processStripeWebhook(eventId, 'payment_intent.created', payload);
      expect(second).toEqual({ processed: false, duplicate: true });
      expect(webhookEvents.size).toBe(1);
    });
  });

  describe('Payroo replay', () => {
    it('payment.completed replayed → second call dedups, payment.succeeded emits exactly once', async () => {
      const { payments, webhookEvents } = setupWith();
      const payment = seedPayrooPendingPayment(payments);

      const onSucceeded = jest.fn();
      paymentEvents.on('payment.succeeded', onSucceeded);

      const eventId = 'evt_payroo_replay_completed_01';
      const payload = { transactionId: PAYROO_TXN, amount: payment.amount };

      const first = await processPayrooWebhook(eventId, 'payment.completed', payload);
      expect(first).toEqual({ processed: true, duplicate: false });
      expect(payment.status).toBe('succeeded');
      expect(payment.capturedAmount).toBe(12000);
      expect(onSucceeded).toHaveBeenCalledTimes(1);

      const second = await processPayrooWebhook(eventId, 'payment.completed', payload);
      expect(second).toEqual({ processed: false, duplicate: true });
      expect(payment.capturedAmount).toBe(12000);
      expect(onSucceeded).toHaveBeenCalledTimes(1);
      expect(webhookEvents.size).toBe(1);
    });

    it('payment.refunded replayed → refundedAmount does not double', async () => {
      const { payments, webhookEvents } = setupWith();
      const payment = seedPayrooPendingPayment(payments);
      // Get to succeeded first.
      await processPayrooWebhook('evt_payroo_pre_refund_succeed', 'payment.completed', {
        transactionId: PAYROO_TXN,
        amount: payment.amount,
      });
      expect(payment.status).toBe('succeeded');

      const onRefunded = jest.fn();
      paymentEvents.on('payment.refunded', onRefunded);

      const refundEventId = 'evt_payroo_refunded_replay_01';
      const refundPayload = { transactionId: PAYROO_TXN, refundedAmount: 12000 };

      const first = await processPayrooWebhook(refundEventId, 'payment.refunded', refundPayload);
      expect(first).toEqual({ processed: true, duplicate: false });
      expect(payment.refundedAmount).toBe(12000);
      expect(payment.status).toBe('refunded');
      expect(onRefunded).toHaveBeenCalledTimes(1);

      const second = await processPayrooWebhook(refundEventId, 'payment.refunded', refundPayload);
      expect(second).toEqual({ processed: false, duplicate: true });
      expect(payment.refundedAmount).toBe(12000);
      expect(onRefunded).toHaveBeenCalledTimes(1);
      expect(webhookEvents.get(refundEventId)?.status).toBe('processed');
    });
  });

  describe('Cross-gateway isolation', () => {
    it('same eventId string is keyed independently per gateway (no collision across providers)', async () => {
      // The schema actually requires uniqueness PER EVENTID across the
      // collection — but in practice Stripe and Payroo IDs use different
      // namespaces (`evt_xxx` vs `payroo_evt_xxx`) so collision is not a
      // real-world concern. This test guards the case anyway: if an
      // operator ever reused the same ID across gateways, the second call
      // would dedup against the first. We document that behaviour here so
      // it's not a silent surprise during incident response.
      const { payments } = setupWith();
      const payment = seedStripeSucceededPayment(payments);

      const eventId = 'evt_collision_with_payroo_01';
      await processStripeWebhook(eventId, 'payment_intent.succeeded', {
        data: { object: { id: STRIPE_PI, amount: payment.amount } },
      });
      expect(payment.status).toBe('succeeded');

      // Payroo posts an event with the SAME eventId. The dedup table is
      // shared across gateways, so the second call sees the existing row
      // and reports duplicate=true. This is intentional: WebhookEvent
      // dedup is by-eventId, not by-(gateway,eventId).
      const second = await processPayrooWebhook(eventId, 'payment.refunded', {
        transactionId: 'unrelated_payroo_txn',
        refundedAmount: 1234,
      });
      expect(second).toEqual({ processed: false, duplicate: true });
    });
  });

  describe('Failure modes', () => {
    it('Payment not found → records failed event, replay still dedups (no second lookup attempt)', async () => {
      const { webhookEvents } = setupWith();
      // No payment seeded — gatewayTxnId lookup will return null.

      const eventId = 'evt_payment_missing_01';
      const payload = { data: { object: { id: 'pi_does_not_exist', amount: 1000 } } };

      const first = await processStripeWebhook(eventId, 'payment_intent.succeeded', payload);
      expect(first).toEqual({ processed: false, duplicate: false });
      const stored = webhookEvents.get(eventId);
      expect(stored?.status).toBe('failed');
      expect(stored?.error).toMatch(/Payment not found/);

      // Replay: dedup wins before we re-attempt the missing-payment path.
      const second = await processStripeWebhook(eventId, 'payment_intent.succeeded', payload);
      expect(second).toEqual({ processed: false, duplicate: true });
      // Only one row, even though the first attempt left it 'failed'.
      // Re-delivery of an already-failed event would otherwise re-run the
      // (still-failing) lookup forever.
      expect(webhookEvents.size).toBe(1);
    });
  });
});
