/**
 * E2E: Collect Payment (staff on behalf of client) → webhook reconciliation
 *
 * Mirrors apps/api/__tests__/e2e/payNowWebhook.test.ts but covers the
 * staff-initiated path and the invariants that DIFFER from Pay Now:
 *
 *   1. Payment.userId is the ORDER OWNER (client), not the staff caller.
 *      Without this, refunds/credits/receipts go to the wrong account
 *      and accounting reconciliation breaks.
 *   2. The webhook event payload carries the client's userId, so
 *      downstream listeners (receipt email, credit-issuance) target the
 *      right person.
 *   3. RBAC `payments:create` is enforced — a staff user without that
 *      permission gets 403 and no Payment row is created.
 *   4. The handler does NOT scope OrderModel.findOne by userId (staff
 *      can pay any order); the only protection is RBAC + the order
 *      owner being recorded as the Payment.userId.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest').default;
import type { Request, Response, NextFunction, RequestHandler } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const express = require('express') as typeof import('express').default;

import { initWebhookProcessor, processStripeWebhook, paymentEvents } from '@nugen/payment-gateway';
import type { IPaymentProvider, PaymentIntentResult } from '@nugen/payment-gateway';
import { createCollectPaymentRoutes } from '../../src/modules/order-management/collectPayment.routes';

// ─── In-memory stores ──────────────────────────────────────────────────────

interface StoredOrder {
  _id: string;
  userId: string; // client (order owner)
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
  metadata?: Record<string, unknown>;
  save: () => Promise<void>;
}

interface StoredWebhookEvent {
  eventId: string;
  status: string;
  save: () => Promise<void>;
}

// ─── Mock factories (kept local — tests are surgical, not a harness) ──────

function buildOrderModel(orders: Map<string, StoredOrder>): unknown {
  return {
    findOne: async (filter: Record<string, unknown>): Promise<StoredOrder | null> => {
      for (const o of orders.values()) {
        if (filter._id && o._id !== filter._id) {
          continue;
        }
        if (o.isDeleted) {
          continue;
        }
        return o;
      }
      return null;
    },
  };
}

function buildPaymentModel(payments: Map<string, StoredPayment>): unknown {
  let idCounter = 1;
  const makeId = (): string => `508f1f77bcf86cd79943${String(idCounter++).padStart(4, '0')}`;

  return {
    findOne: (filter?: Record<string, unknown>) => {
      const run = (): StoredPayment | null => {
        for (const p of payments.values()) {
          if (filter?.idempotencyKey && p.idempotencyKey !== filter.idempotencyKey) {
            continue;
          }
          if (filter?.gatewayTxnId && p.gatewayTxnId !== filter.gatewayTxnId) {
            continue;
          }
          return p;
        }
        return null;
      };
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
        metadata: data.metadata as Record<string, unknown> | undefined,
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
    payrooEnabled: false,
    toObject(): Record<string, unknown> {
      return {
        primaryGateway: 'stripe',
        routingRule: 'primary_only',
        stripeEnabled: true,
        payrooEnabled: false,
      };
    },
  };
  return {
    findOne: async (): Promise<typeof config> => config,
    create: async (): Promise<typeof config> => config,
  };
}

function buildWebhookEventModel(webhookEvents: Map<string, StoredWebhookEvent>): unknown {
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

function buildStripeProvider(): IPaymentProvider {
  let intentCounter = 1;
  return {
    name: 'stripe',
    createPaymentIntent: async (params): Promise<PaymentIntentResult> => {
      const id = `pi_collect_${intentCounter++}`;
      return {
        gateway: 'stripe',
        gatewayTxnId: id,
        clientSecret: `${id}_secret_xyz`,
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

const STAFF_ID = '670000000000000000000003';
const CLIENT_ID = '670000000000000000000010';
const ORDER_ID = '670000000000000000000020';

function createApp(opts?: { denyPermission?: boolean; staffUserId?: string }): {
  app: express.Express;
  orders: Map<string, StoredOrder>;
  payments: Map<string, StoredPayment>;
} {
  const orders = new Map<string, StoredOrder>();
  const payments = new Map<string, StoredPayment>();
  const webhookEvents = new Map<string, StoredWebhookEvent>();

  const order: StoredOrder = {
    _id: ORDER_ID,
    userId: CLIENT_ID, // owner is client
    orderNumber: 'QGS-O-0042',
    totalAmount: 24500,
    paymentStatus: 'pending',
    isDeleted: false,
    save: async (): Promise<void> => {
      orders.set(ORDER_ID, order);
    },
  };
  orders.set(ORDER_ID, order);

  const authenticate = (): RequestHandler => {
    return (req: Request, _res: Response, next: NextFunction): void => {
      (req as unknown as Record<string, unknown>).user = {
        userId: opts?.staffUserId ?? STAFF_ID,
        _id: opts?.staffUserId ?? STAFF_ID,
        userType: 5, // senior_staff
      };
      next();
    };
  };

  const checkPermission = (_resource: string, _action: string): RequestHandler => {
    return (_req: Request, res: Response, next: NextFunction): void => {
      if (opts?.denyPermission) {
        res
          .status(403)
          .json({ status: 403, code: 'FORBIDDEN', message: 'Insufficient permissions' });
        return;
      }
      next();
    };
  };

  const router = createCollectPaymentRoutes({
    OrderModel: buildOrderModel(orders) as never,
    PaymentModel: buildPaymentModel(payments) as never,
    GatewayConfigModel: buildGatewayConfigModel() as never,
    providers: new Map([['stripe', buildStripeProvider()]]) as never,
    authenticate,
    checkPermission,
  });

  // The webhook processor and the route both wrap the SAME `payments`
  // Map: buildPaymentModel returns a fresh closure each call, but the
  // closures all read/write the Map by reference, so mutations made via
  // the webhook processor's model are visible to the route's model.
  initWebhookProcessor(
    buildWebhookEventModel(webhookEvents) as never,
    buildPaymentModel(payments) as never,
  );

  const app = express();
  app.use(express.json());
  app.use('/orders', router);

  return { app, orders, payments };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('E2E: Collect Payment (staff) → webhook reconciliation', () => {
  it('records Payment.userId as the order owner (client), not the staff caller', async () => {
    const { app, payments } = createApp();

    const res = await request(app)
      .post(`/orders/${ORDER_ID}/collect-payment`)
      .send({ idempotencyKey: 'idem_collect_owner_001' });

    expect(res.status).toBe(201);
    expect(payments.size).toBe(1);
    const [payment] = [...payments.values()];

    // The accounting/security invariant: payment is owned by the client,
    // even though staff initiated it. Refunds, receipts, and credit
    // entries hang off Payment.userId — getting this wrong sends them to
    // the wrong person.
    expect(payment.userId.toString()).toBe(CLIENT_ID);
    expect(payment.userId.toString()).not.toBe(STAFF_ID);
    expect(payment.metadata?.collectedBy).toBe(STAFF_ID);
  });

  it('webhook succeeded fires payment.succeeded with the client userId in payload', async () => {
    const { app, payments } = createApp();

    const payRes = await request(app)
      .post(`/orders/${ORDER_ID}/collect-payment`)
      .send({ idempotencyKey: 'idem_collect_webhook_01' });
    expect(payRes.status).toBe(201);
    const [payment] = [...payments.values()];

    const handler = jest.fn();
    paymentEvents.on('payment.succeeded', handler);

    const result = await processStripeWebhook(
      'evt_collect_succeeded_01',
      'payment_intent.succeeded',
      {
        data: {
          object: { id: payment.gatewayTxnId, amount: payment.amount },
        },
      },
    );

    expect(result.processed).toBe(true);
    expect(payment.status).toBe('succeeded');
    expect(handler).toHaveBeenCalledTimes(1);
    // Downstream listeners (receipt email, credit issuance) target this
    // userId — must be the client, never the staff actor.
    expect(handler.mock.calls[0][0]).toMatchObject({
      orderId: ORDER_ID,
      userId: CLIENT_ID,
      status: 'succeeded',
    });

    paymentEvents.removeListener('payment.succeeded', handler);
  });

  it('staff without payments:create permission gets 403, no Payment created', async () => {
    const { app, payments } = createApp({ denyPermission: true });

    const res = await request(app)
      .post(`/orders/${ORDER_ID}/collect-payment`)
      .send({ idempotencyKey: 'idem_collect_rbac_block_01' });

    expect(res.status).toBe(403);
    expect(payments.size).toBe(0);
  });

  it('rejects collect-payment for an already-paid order (409)', async () => {
    const { app, orders, payments } = createApp();
    const order = orders.get(ORDER_ID);
    if (order) {
      order.paymentStatus = 'succeeded';
    }

    const res = await request(app)
      .post(`/orders/${ORDER_ID}/collect-payment`)
      .send({ idempotencyKey: 'idem_collect_already_paid_01' });

    expect(res.status).toBe(409);
    expect(payments.size).toBe(0);
  });

  it('idempotencyKey replay returns the existing Payment (200, no duplicate row)', async () => {
    const { app, payments } = createApp();
    const key = 'idem_collect_replay_001';

    const first = await request(app)
      .post(`/orders/${ORDER_ID}/collect-payment`)
      .send({ idempotencyKey: key });
    expect(first.status).toBe(201);
    expect(payments.size).toBe(1);

    const second = await request(app)
      .post(`/orders/${ORDER_ID}/collect-payment`)
      .send({ idempotencyKey: key });
    expect(second.status).toBe(200);
    expect(payments.size).toBe(1);
    expect(second.body.data.paymentId).toBe([...payments.values()][0]._id);
  });
});
