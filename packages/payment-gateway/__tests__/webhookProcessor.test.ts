import {
  initWebhookProcessor,
  processStripeWebhook,
  processPayrooWebhook,
  paymentEvents,
} from '../src/services/webhookProcessor';

// ─── Mock Models ─────────────────────────────────────────────────────────────

interface MockPayment {
  _id: { toString: () => string };
  orderId: { toString: () => string };
  userId: { toString: () => string };
  gateway: string;
  gatewayTxnId: string;
  amount: number;
  capturedAmount: number;
  refundedAmount: number;
  status: string;
  webhookProcessed: boolean;
  webhookProcessedAt: Date | null;
  save: jest.Mock;
}

const mockPaymentData: MockPayment = {
  _id: { toString: () => '507f1f77bcf86cd799439011' },
  orderId: { toString: () => '507f1f77bcf86cd799439012' },
  userId: { toString: () => '507f1f77bcf86cd799439013' },
  gateway: 'stripe',
  gatewayTxnId: 'pi_test_123',
  amount: 16500,
  capturedAmount: 16500,
  refundedAmount: 0,
  status: 'captured',
  webhookProcessed: false,
  webhookProcessedAt: null,
  save: jest.fn().mockResolvedValue(undefined),
};

let webhookEventStore: Map<string, unknown> = new Map();
let shouldPaymentExist = true;
let currentPaymentStatus = 'captured';
// Shared payment state + save spy so tests can assert mutation (or lack of
// it on webhook replay) across multiple processStripeWebhook calls.
let paymentState: Record<string, unknown> = {};
let paymentSaveSpy: jest.Mock = jest.fn();

const MockWebhookEventModel = {
  findOne: jest.fn((query: { eventId: string }) => {
    const result = webhookEventStore.get(query.eventId) ?? null;
    return { lean: jest.fn().mockResolvedValue(result) };
  }),
  create: jest.fn(async (data: Record<string, unknown>) => {
    const doc = {
      ...data,
      status: 'processing',
      retryCount: 0,
      save: jest.fn(async function (this: Record<string, unknown>) {
        webhookEventStore.set(data.eventId as string, this);
      }),
    };
    webhookEventStore.set(data.eventId as string, doc);
    return doc;
  }),
};

const MockPaymentModel = {
  findOne: jest.fn(async () => {
    if (!shouldPaymentExist) {
      return null;
    }
    // Return a proxy over shared paymentState so mutations persist across
    // multiple findOne calls within a single test (the webhook processor
    // reads status, assigns new status, calls save — a fresh object each
    // call would hide this). Also reuse the shared save spy so tests can
    // count saves across replays.
    return new Proxy(paymentState, {
      set(target, key, value) {
        (target as Record<string | symbol, unknown>)[key as string] = value;
        return true;
      },
      get(target, key) {
        if (key === 'save') {
          return paymentSaveSpy;
        }
        return (target as Record<string | symbol, unknown>)[key as string];
      },
    });
  }),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WebhookProcessor', () => {
  beforeEach(() => {
    webhookEventStore = new Map();
    shouldPaymentExist = true;
    currentPaymentStatus = 'captured';
    paymentSaveSpy = jest.fn().mockResolvedValue(undefined);
    paymentState = {
      ...mockPaymentData,
      status: currentPaymentStatus,
    };
    jest.clearAllMocks();
    initWebhookProcessor(MockWebhookEventModel as never, MockPaymentModel as never);
  });

  describe('processStripeWebhook', () => {
    it('should process a new payment_intent.succeeded webhook', async () => {
      const eventHandler = jest.fn();
      paymentEvents.on('payment.succeeded', eventHandler);

      const result = await processStripeWebhook('evt_test_001', 'payment_intent.succeeded', {
        data: {
          object: {
            id: 'pi_test_123',
            amount: 16500,
          },
        },
      });

      expect(result.processed).toBe(true);
      expect(result.duplicate).toBe(false);
      expect(MockWebhookEventModel.create).toHaveBeenCalled();

      paymentEvents.removeListener('payment.succeeded', eventHandler);
    });

    it('should return duplicate=true for already processed eventId (PAY-INV-03)', async () => {
      // First process
      await processStripeWebhook('evt_test_dup', 'payment_intent.succeeded', {
        data: { object: { id: 'pi_test_123' } },
      });

      // Second process — should detect duplicate
      const result = await processStripeWebhook('evt_test_dup', 'payment_intent.succeeded', {
        data: { object: { id: 'pi_test_123' } },
      });

      expect(result.duplicate).toBe(true);
      expect(result.processed).toBe(false);
    });

    it('should handle unknown event types gracefully', async () => {
      const result = await processStripeWebhook('evt_unknown_001', 'unknown.event.type', {
        data: { object: { id: 'pi_test_123' } },
      });

      expect(result.processed).toBe(false);
      expect(result.duplicate).toBe(false);
    });

    it('should not reprocess when payment not found', async () => {
      shouldPaymentExist = false;

      const result = await processStripeWebhook('evt_nopay_001', 'payment_intent.succeeded', {
        data: { object: { id: 'pi_nonexistent' } },
      });

      expect(result.processed).toBe(false);
    });

    // ─── Replay idempotency (money-path) ──────────────────────────────────
    // The existing "duplicate=true" test above only checks the return flag.
    // This one proves the Payment is NOT re-mutated on replay — the actual
    // invariant that stops double-charging / double-crediting a user.
    it('replay of the same eventId does not mutate the Payment a second time', async () => {
      await processStripeWebhook('evt_replay_001', 'payment_intent.succeeded', {
        data: { object: { id: 'pi_test_123', amount: 16500 } },
      });
      const savesAfterFirst = paymentSaveSpy.mock.calls.length;
      expect(savesAfterFirst).toBeGreaterThan(0);
      expect(paymentState.status).toBe('succeeded');
      expect(paymentState.webhookProcessed).toBe(true);

      // Tamper with state to prove replay doesn't touch it
      paymentState.status = 'succeeded';
      paymentState.tampered = true;

      const result = await processStripeWebhook('evt_replay_001', 'payment_intent.succeeded', {
        data: { object: { id: 'pi_test_123', amount: 16500 } },
      });

      expect(result.duplicate).toBe(true);
      expect(paymentSaveSpy.mock.calls.length).toBe(savesAfterFirst);
      expect(paymentState.tampered).toBe(true); // state untouched
    });

    // ─── payment_intent.payment_failed (money-path) ───────────────────────
    // No existing test verifies the failure path transitions Payment.status
    // to 'failed' and emits payment.failed. Without this, a failed charge
    // could silently be treated as captured if the mapping regresses.
    it('payment_intent.payment_failed transitions captured → failed and emits payment.failed', async () => {
      const failedHandler = jest.fn();
      paymentEvents.on('payment.failed', failedHandler);

      const result = await processStripeWebhook('evt_fail_001', 'payment_intent.payment_failed', {
        data: { object: { id: 'pi_test_123' } },
      });

      expect(result.processed).toBe(true);
      expect(paymentState.status).toBe('failed');
      expect(paymentState.webhookProcessed).toBe(true);
      expect(failedHandler).toHaveBeenCalledTimes(1);
      expect(failedHandler.mock.calls[0][0]).toMatchObject({
        status: 'failed',
        previousStatus: 'captured',
      });

      paymentEvents.removeListener('payment.failed', failedHandler);
    });

    // ─── charge.refunded partial (money-path) ─────────────────────────────
    // PAY-INV-06 et al. — a partial refund webhook must leave
    // capturedAmount intact but set refundedAmount and flip status to
    // 'partially_refunded'. A full refund must flip to 'refunded'. This
    // guards the refund/credit-memo pipeline from regressing.
    it('charge.refunded with partial amount sets status=partially_refunded and refundedAmount', async () => {
      paymentState.status = 'succeeded'; // refund only valid from succeeded
      const result = await processStripeWebhook('evt_refund_partial', 'charge.refunded', {
        data: {
          object: {
            id: 'ch_test_123',
            payment_intent: 'pi_test_123',
            amount_refunded: 5000, // partial — capturedAmount is 16500
          },
        },
      });

      expect(result.processed).toBe(true);
      expect(paymentState.refundedAmount).toBe(5000);
      expect(paymentState.status).toBe('partially_refunded');
    });

    it('charge.refunded with full amount sets status=refunded', async () => {
      paymentState.status = 'succeeded';
      const result = await processStripeWebhook('evt_refund_full', 'charge.refunded', {
        data: {
          object: {
            id: 'ch_test_456',
            payment_intent: 'pi_test_123',
            amount_refunded: 16500, // full
          },
        },
      });

      expect(result.processed).toBe(true);
      expect(paymentState.refundedAmount).toBe(16500);
      expect(paymentState.status).toBe('refunded');
    });

    // ─── Invalid transition guard (PAY-INV-07) ────────────────────────────
    // If a late-arriving webhook tries to move a refunded payment back to
    // succeeded (or any other invalid transition), the processor must
    // ignore it — otherwise a delayed-delivery `payment_intent.succeeded`
    // could un-refund a payment after the user has received their credit.
    it('ignores invalid transition (refunded → succeeded) without mutating Payment', async () => {
      paymentState.status = 'refunded';
      const savesBefore = paymentSaveSpy.mock.calls.length;

      const result = await processStripeWebhook(
        'evt_invalid_transition',
        'payment_intent.succeeded',
        { data: { object: { id: 'pi_test_123' } } },
      );

      expect(result.processed).toBe(false);
      expect(paymentState.status).toBe('refunded'); // unchanged
      expect(paymentSaveSpy.mock.calls.length).toBe(savesBefore);
    });
  });

  describe('processPayrooWebhook', () => {
    it('should process a Payroo payment.completed webhook', async () => {
      const result = await processPayrooWebhook('pz_evt_001', 'payment.completed', {
        transactionId: 'pi_test_123',
        amount: 16500,
      });

      expect(result.processed).toBe(true);
      expect(result.duplicate).toBe(false);
    });

    it('should return duplicate=true for repeated Payroo eventId', async () => {
      await processPayrooWebhook('pz_evt_dup', 'payment.completed', {
        transactionId: 'pi_test_123',
      });

      const result = await processPayrooWebhook('pz_evt_dup', 'payment.completed', {
        transactionId: 'pi_test_123',
      });

      expect(result.duplicate).toBe(true);
    });
  });
});
