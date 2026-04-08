import {
  initWebhookProcessor,
  processStripeWebhook,
  processPayzooWebhook,
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
    if (!shouldPaymentExist) return null;
    return {
      ...mockPaymentData,
      status: currentPaymentStatus,
      save: jest.fn().mockResolvedValue(undefined),
    };
  }),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WebhookProcessor', () => {
  beforeEach(() => {
    webhookEventStore = new Map();
    shouldPaymentExist = true;
    currentPaymentStatus = 'captured';
    jest.clearAllMocks();
    initWebhookProcessor(
      MockWebhookEventModel as never,
      MockPaymentModel as never,
    );
  });

  describe('processStripeWebhook', () => {
    it('should process a new payment_intent.succeeded webhook', async () => {
      const eventHandler = jest.fn();
      paymentEvents.on('payment.succeeded', eventHandler);

      const result = await processStripeWebhook(
        'evt_test_001',
        'payment_intent.succeeded',
        {
          data: {
            object: {
              id: 'pi_test_123',
              amount: 16500,
            },
          },
        },
      );

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
      const result = await processStripeWebhook(
        'evt_unknown_001',
        'unknown.event.type',
        { data: { object: { id: 'pi_test_123' } } },
      );

      expect(result.processed).toBe(false);
      expect(result.duplicate).toBe(false);
    });

    it('should not reprocess when payment not found', async () => {
      shouldPaymentExist = false;

      const result = await processStripeWebhook(
        'evt_nopay_001',
        'payment_intent.succeeded',
        { data: { object: { id: 'pi_nonexistent' } } },
      );

      expect(result.processed).toBe(false);
    });
  });

  describe('processPayzooWebhook', () => {
    it('should process a Payzoo payment.completed webhook', async () => {
      const result = await processPayzooWebhook(
        'pz_evt_001',
        'payment.completed',
        { transactionId: 'pi_test_123', amount: 16500 },
      );

      expect(result.processed).toBe(true);
      expect(result.duplicate).toBe(false);
    });

    it('should return duplicate=true for repeated Payzoo eventId', async () => {
      await processPayzooWebhook('pz_evt_dup', 'payment.completed', {
        transactionId: 'pi_test_123',
      });

      const result = await processPayzooWebhook('pz_evt_dup', 'payment.completed', {
        transactionId: 'pi_test_123',
      });

      expect(result.duplicate).toBe(true);
    });
  });
});
