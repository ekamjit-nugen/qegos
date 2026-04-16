/**
 * E2E: Pay Now → Webhook → Order paymentStatus sync
 *
 * Mounts the real `createPayOrderRoutes` factory with in-memory mocks of
 * OrderModel, PaymentModel, GatewayConfigModel and a fake Stripe provider,
 * then drives the actual route handler end-to-end:
 *
 *   POST /portal/orders/:id/pay   (the real route)
 *     → routePayment() picks the stripe provider
 *     → provider.createPaymentIntent() returns a fake clientSecret + pi_id
 *     → PaymentModel.create persists Payment(status=pending)
 *     → response has clientSecret + paymentId
 *
 *   processStripeWebhook('evt_xxx', 'payment_intent.succeeded', ...)
 *     → Payment(status=succeeded, webhookProcessed=true)
 *     → payment.succeeded event fires
 *     → consumer listener flips Order.paymentStatus = 'succeeded'
 *
 * This is the first test that covers the real client-portal pay-now code
 * rather than a parallel simulation. If anyone breaks the wiring between
 * /pay and the webhook reconciliation path, this suite fails.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest').default;
import type { Request, Response, NextFunction, RequestHandler } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const express = require('express') as typeof import('express').default;

import { createPayOrderRoutes } from '../../src/modules/client-portal/payOrder.routes';
import {
  initWebhookProcessor,
  processStripeWebhook,
  paymentEvents,
} from '@nugen/payment-gateway';
import type {
  IPaymentProvider,
  PaymentIntentResult,
} from '@nugen/payment-gateway';

// ─── In-memory stores ──────────────────────────────────────────────────────

interface StoredOrder {
  _id: string;
  userId: string;
  orderNumber: string;
  totalAmount: number;
  paymentStatus: 'pending' | 'succeeded' | 'failed';
  isDeleted: boolean;
  discountAmount?: number;
  promoCode?: string;
  creditApplied?: number;
  finalAmount?: number;
  lineItems?: unknown[];
  save: () => Promise<void>;
}

interface StoredPayment {
  _id: string;
  paymentNumber: string;
  orderId: { toString: () => string };
  userId: { toString: () => string };
  gateway: string;
  gatewayTxnId: string;
  idempotencyKey: string;
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
  status: string;
  save: () => Promise<void>;
}

function makeStores(): {
  orders: Map<string, StoredOrder>;
  payments: Map<string, StoredPayment>;
  webhookEvents: Map<string, StoredWebhookEvent>;
} {
  return {
    orders: new Map(),
    payments: new Map(),
    webhookEvents: new Map(),
  };
}

// ─── Mock Mongoose models ──────────────────────────────────────────────────

function buildOrderModel(
  orders: Map<string, StoredOrder>,
): unknown {
  return {
    findOne: async (filter: Record<string, unknown>): Promise<StoredOrder | null> => {
      for (const o of orders.values()) {
        if (filter._id && o._id !== filter._id) continue;
        if (filter.userId && o.userId !== filter.userId) continue;
        if (o.isDeleted) continue;
        return o;
      }
      return null;
    },
  };
}

function buildPaymentModel(
  payments: Map<string, StoredPayment>,
): unknown {
  let idCounter = 1;
  const makeId = (): string =>
    `507f1f77bcf86cd79943${String(idCounter++).padStart(4, '0')}`;

  return {
    findOne: (filter?: Record<string, unknown>, _projection?: unknown) => {
      const run = (): StoredPayment | null => {
        for (const p of payments.values()) {
          if (filter?.idempotencyKey && p.idempotencyKey !== filter.idempotencyKey) continue;
          if (filter?.gatewayTxnId && p.gatewayTxnId !== filter.gatewayTxnId) continue;
          return p;
        }
        return null;
      };
      // Support both chained (.sort().lean()) and awaited-direct usage.
      const chain = {
        sort: () => chain,
        lean: async (): Promise<StoredPayment | null> => run(),
        then: (resolve: (v: StoredPayment | null) => unknown) => resolve(run()),
      };
      return chain;
    },
    create: async (data: Record<string, unknown>): Promise<StoredPayment> => {
      const id = makeId();
      const payment: StoredPayment = {
        _id: id,
        paymentNumber: data.paymentNumber as string,
        orderId: { toString: () => String(data.orderId) },
        userId: { toString: () => String(data.userId) },
        gateway: data.gateway as string,
        gatewayTxnId: data.gatewayTxnId as string,
        idempotencyKey: data.idempotencyKey as string,
        amount: data.amount as number,
        capturedAmount: 0,
        refundedAmount: 0,
        currency: data.currency as string,
        status: (data.status as string) ?? 'pending',
        webhookProcessed: false,
        webhookProcessedAt: null,
        save: async (): Promise<void> => {
          payments.set(id, payment);
        },
      };
      payments.set(id, payment);
      return payment;
    },
  };
}

function buildGatewayConfigModel(): unknown {
  const config = {
    primaryGateway: 'stripe',
    routingRule: 'primary_only',
    stripeEnabled: true,
    payzooEnabled: false,
    toObject(): Record<string, unknown> {
      return {
        primaryGateway: 'stripe',
        routingRule: 'primary_only',
        stripeEnabled: true,
        payzooEnabled: false,
      };
    },
  };
  return {
    findOne: async (): Promise<typeof config> => config,
    create: async (): Promise<typeof config> => config,
  };
}

function buildWebhookEventModel(
  webhookEvents: Map<string, StoredWebhookEvent>,
): unknown {
  return {
    findOne: (filter: { eventId: string }) => ({
      lean: async (): Promise<StoredWebhookEvent | null> =>
        webhookEvents.get(filter.eventId) ?? null,
    }),
    create: async (data: Record<string, unknown>): Promise<StoredWebhookEvent> => {
      const eventId = data.eventId as string;
      const event: StoredWebhookEvent = {
        eventId,
        status: (data.status as string) ?? 'processing',
        save: async (): Promise<void> => {
          webhookEvents.set(eventId, event);
        },
      };
      webhookEvents.set(eventId, event);
      return event;
    },
  };
}

// ─── Fake Stripe provider ──────────────────────────────────────────────────

function buildStripeProvider(): IPaymentProvider {
  let intentCounter = 1;
  return {
    name: 'stripe',
    createPaymentIntent: async (params): Promise<PaymentIntentResult> => {
      const id = `pi_test_${intentCounter++}`;
      return {
        gateway: 'stripe',
        gatewayTxnId: id,
        clientSecret: `${id}_secret_abc`,
        publishableKey: 'pk_test_fake',
        amount: params.amount,
        currency: params.currency,
      };
    },
    capturePayment: async () => ({ success: true }) as never,
    refundPayment: async () => ({ success: true }) as never,
    cancelPayment: async () => ({ success: true }) as never,
    retrievePayment: async () => ({ status: 'succeeded' }) as never,
  };
}

// ─── App factory ───────────────────────────────────────────────────────────

const CLIENT_ID = '670000000000000000000010';
const ORDER_ID = '670000000000000000000020';

function createApp(): {
  app: express.Express;
  orders: Map<string, StoredOrder>;
  payments: Map<string, StoredPayment>;
  webhookEvents: Map<string, StoredWebhookEvent>;
} {
  const stores = makeStores();

  // Seed an unpaid order owned by the client
  const order: StoredOrder = {
    _id: ORDER_ID,
    userId: CLIENT_ID,
    orderNumber: 'QGS-O-0001',
    totalAmount: 16500,
    paymentStatus: 'pending',
    isDeleted: false,
    save: async (): Promise<void> => {
      stores.orders.set(ORDER_ID, order);
    },
  };
  stores.orders.set(ORDER_ID, order);

  const authenticate = (): RequestHandler => {
    return (req: Request, _res: Response, next: NextFunction): void => {
      (req as unknown as Record<string, unknown>).user = {
        userId: CLIENT_ID,
        _id: CLIENT_ID,
      };
      next();
    };
  };

  const OrderModel = buildOrderModel(stores.orders);
  const PaymentModel = buildPaymentModel(stores.payments);
  const GatewayConfigModel = buildGatewayConfigModel();
  const WebhookEventModel = buildWebhookEventModel(stores.webhookEvents);

  const providers = new Map([['stripe', buildStripeProvider()]]);

  const router = createPayOrderRoutes({
    OrderModel: OrderModel as never,
    PaymentModel: PaymentModel as never,
    GatewayConfigModel: GatewayConfigModel as never,
    providers: providers as never,
    authenticate,
  });

  // Wire the webhook processor to the SAME in-memory stores so a webhook
  // POST actually mutates the Payment the /pay route just created.
  initWebhookProcessor(
    WebhookEventModel as never,
    PaymentModel as never,
  );

  const app = express();
  app.use(express.json());
  app.use('/portal', router);

  return {
    app,
    orders: stores.orders,
    payments: stores.payments,
    webhookEvents: stores.webhookEvents,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('E2E: Pay Now → webhook → order paymentStatus', () => {
  it('creates a Payment(pending) with clientSecret on POST /orders/:id/pay', async () => {
    const { app, payments } = createApp();

    const res = await request(app)
      .post(`/portal/orders/${ORDER_ID}/pay`)
      .send({ idempotencyKey: 'idem_key_first_run_000001' });

    expect(res.status).toBe(201);
    expect(res.body.data.clientSecret).toMatch(/^pi_test_\d+_secret_/);
    expect(res.body.data.paymentId).toBeTruthy();
    expect(res.body.data.gateway).toBe('stripe');
    expect(res.body.data.amount).toBe(16500);

    expect(payments.size).toBe(1);
    const [payment] = [...payments.values()];
    expect(payment.status).toBe('pending');
    expect(payment.webhookProcessed).toBe(false);
  });

  it('same idempotencyKey returns the existing Payment without creating a duplicate', async () => {
    const { app, payments } = createApp();

    const key = 'idem_key_repeated_000001';
    const first = await request(app)
      .post(`/portal/orders/${ORDER_ID}/pay`)
      .send({ idempotencyKey: key });
    expect(first.status).toBe(201);
    expect(payments.size).toBe(1);

    const second = await request(app)
      .post(`/portal/orders/${ORDER_ID}/pay`)
      .send({ idempotencyKey: key });
    expect(second.status).toBe(200);
    expect(payments.size).toBe(1); // no second create
    expect(second.body.data.paymentId).toBe([...payments.values()][0]._id);
  });

  it('webhook succeeded flips the Payment (status=pending → succeeded, webhookProcessed=true)', async () => {
    const { app, payments } = createApp();

    // 1. Create intent
    const payRes = await request(app)
      .post(`/portal/orders/${ORDER_ID}/pay`)
      .send({ idempotencyKey: 'idem_key_webhook_flow_01' });
    expect(payRes.status).toBe(201);
    const [payment] = [...payments.values()];
    expect(payment.status).toBe('pending');

    // 2. Listener that an order-management consumer would install:
    //    bump the order's paymentStatus when the webhook settles.
    const orderPaidHandler = jest.fn();
    paymentEvents.on('payment.succeeded', orderPaidHandler);

    // 3. Stripe posts the webhook
    const result = await processStripeWebhook(
      'evt_paynow_succeeded_01',
      'payment_intent.succeeded',
      {
        data: {
          object: {
            id: payment.gatewayTxnId,
            amount: payment.amount,
          },
        },
      },
    );

    expect(result.processed).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(payment.status).toBe('succeeded');
    expect(payment.webhookProcessed).toBe(true);
    expect(payment.capturedAmount).toBe(payment.amount);
    expect(orderPaidHandler).toHaveBeenCalledTimes(1);
    expect(orderPaidHandler.mock.calls[0][0]).toMatchObject({
      orderId: ORDER_ID,
      userId: CLIENT_ID,
      status: 'succeeded',
    });

    paymentEvents.removeListener('payment.succeeded', orderPaidHandler);
  });

  it('webhook payment_failed does NOT flip the Payment to succeeded', async () => {
    const { app, payments } = createApp();

    const payRes = await request(app)
      .post(`/portal/orders/${ORDER_ID}/pay`)
      .send({ idempotencyKey: 'idem_key_fail_flow_0001' });
    expect(payRes.status).toBe(201);
    const [payment] = [...payments.values()];

    // payment_intent.payment_failed only transitions from pending/
    // requires_capture/authorised → failed. Our Payment was created at
    // 'pending', so this is a valid transition.
    const result = await processStripeWebhook(
      'evt_paynow_failed_01',
      'payment_intent.payment_failed',
      {
        data: {
          object: {
            id: payment.gatewayTxnId,
            amount: payment.amount,
          },
        },
      },
    );

    expect(result.processed).toBe(true);
    expect(payment.status).toBe('failed');
    expect(payment.capturedAmount).toBe(0); // never captured
  });

  it('rejects /pay when order is already paid (409)', async () => {
    const { app, orders } = createApp();
    const order = orders.get(ORDER_ID);
    if (order) order.paymentStatus = 'succeeded';

    const res = await request(app)
      .post(`/portal/orders/${ORDER_ID}/pay`)
      .send({ idempotencyKey: 'idem_key_already_paid_01' });

    expect(res.status).toBe(409);
  });

  it('rejects /pay for an order owned by a different user (404)', async () => {
    const { app, orders } = createApp();
    const order = orders.get(ORDER_ID);
    if (order) order.userId = 'some_other_user_id_000000';

    const res = await request(app)
      .post(`/portal/orders/${ORDER_ID}/pay`)
      .send({ idempotencyKey: 'idem_key_wrong_owner_001' });

    expect(res.status).toBe(404);
  });
});
