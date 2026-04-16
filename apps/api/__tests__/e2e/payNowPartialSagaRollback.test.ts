/**
 * E2E: Pay Now partial-Stripe path — saga rollback on mid-flight failure
 *
 * The partial-Stripe branch of POST /portal/orders/:id/pay (taken when
 * credits + promo together don't cover the full order) used to be a
 * linear sequence:
 *
 *   routePayment → PaymentModel.create → useCredit → applyPromoCode →
 *   order.save
 *
 * If anything after `routePayment` failed synchronously, we'd be left
 * holding a Stripe PaymentIntent for held funds while the user's credits
 * were already deducted (or worse, the order's `paymentStatus` already
 * flipped). The webhook listener — `paymentCompensation.listener` — can't
 * help here because the customer never confirms the intent in the first
 * place; the failure happens before they ever see the payment sheet.
 *
 * The route now wraps that path in `runSaga('payOrder.partialStripe', ...)`
 * with these compensations:
 *
 *   createStripeIntent ↺ provider.cancelPayment(intent, 'abandoned')
 *   persistPayment     ↺ payment.status='cancelled', domainCompensated=true
 *   useCredit          ↺ creditService.addCredit(refund_credit)
 *   applyPromoCode     ↺ promoCodeService.revokePromoCode
 *   updateOrder        ↺ restore order from snapshot
 *
 * `domainCompensated=true` on the cancelled payment prevents the listener
 * from double-compensating when Stripe later fires `payment_intent.canceled`
 * in response to our own provider.cancelPayment call.
 *
 * This suite proves:
 *   1. Happy path — all forward steps run, response includes clientSecret.
 *   2. order.save throws — every prior step's compensation fires in
 *      reverse: revoke promo, refund credit, mark payment cancelled +
 *      domainCompensated, cancel Stripe intent.
 *   3. applyPromoCode throws — useCredit refund + persistPayment cancel +
 *      Stripe cancel fire (no promo revoke since promo never applied).
 *   4. useCredit throws — only persistPayment cancel + Stripe cancel
 *      fire.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const request = require('supertest') as typeof import('supertest').default;
import type { Request, Response, NextFunction, RequestHandler } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const express = require('express') as typeof import('express').default;

import type { IPaymentProvider } from '@nugen/payment-gateway';
import { createPayOrderRoutes } from '../../src/modules/client-portal/payOrder.routes';
import type { PromoCodeServiceResult } from '../../src/modules/promo-code/promoCode.service';
import type { CreditServiceResult } from '../../src/modules/credit/credit.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const CLIENT_ID = '670000000000000000000010';
const ORDER_ID = '670000000000000000000020';
const TOTAL = 16500;
const CREDIT_BALANCE = 5000; // partial coverage — Stripe still needed
const PROMO_DISCOUNT = 2000;

// ─── In-memory order ────────────────────────────────────────────────────────

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

function makeOrder(overrides?: Partial<StoredOrder>): StoredOrder {
  const order: StoredOrder = {
    _id: ORDER_ID,
    userId: CLIENT_ID,
    orderNumber: 'QGS-O-0001',
    totalAmount: TOTAL,
    paymentStatus: 'pending',
    isDeleted: false,
    save: async (): Promise<void> => {
      // re-bound per test to simulate failure
    },
    ...overrides,
  };
  return order;
}

function buildOrderModel(order: StoredOrder): unknown {
  return {
    findOne: async (filter: Record<string, unknown>): Promise<StoredOrder | null> => {
      if (filter._id !== order._id) {
        return null;
      }
      if (filter.userId && filter.userId !== order.userId) {
        return null;
      }
      if (order.isDeleted) {
        return null;
      }
      return order;
    },
  };
}

// ─── In-memory PaymentModel ─────────────────────────────────────────────────

interface StoredPayment {
  _id: string;
  paymentNumber: string;
  orderId: string;
  userId: string;
  gateway: string;
  gatewayTxnId: string;
  idempotencyKey: string;
  amount: number;
  currency: string;
  status: string;
  domainCompensated?: boolean;
  domainCompensatedAt?: Date;
  metadata?: Record<string, unknown>;
  save: () => Promise<void>;
}

function buildPaymentModel(store: { last: StoredPayment | null }): unknown {
  return {
    // Used in two places: idempotency lookup (with filter) AND
    // generatePaymentNumber (no filter, with sort+lean chain).
    findOne: (filter: Record<string, unknown> = {}, _projection?: unknown) => {
      // generatePaymentNumber path: chains .sort().lean()
      if (Object.keys(filter).length === 0) {
        return {
          sort: () => ({
            lean: async (): Promise<StoredPayment | null> => null,
          }),
        };
      }
      // Idempotency-key lookup path: chains .lean() directly
      return {
        lean: async (): Promise<StoredPayment | null> => null,
      };
    },
    create: async (doc: Partial<StoredPayment>): Promise<StoredPayment> => {
      const payment: StoredPayment = {
        _id: '670000000000000000000099',
        paymentNumber: doc.paymentNumber ?? 'QGS-PAY-0001',
        orderId: String(doc.orderId),
        userId: String(doc.userId),
        gateway: doc.gateway ?? 'stripe',
        gatewayTxnId: doc.gatewayTxnId ?? 'pi_test',
        idempotencyKey: doc.idempotencyKey ?? '',
        amount: doc.amount ?? 0,
        currency: doc.currency ?? 'AUD',
        status: doc.status ?? 'pending',
        metadata: doc.metadata,
        save: async (): Promise<void> => {
          // mutations on `payment` are observed via store.last
        },
      };
      store.last = payment;
      return payment;
    },
  };
}

function buildGatewayConfigModel(): unknown {
  // primary_only Stripe config; stripeEnabled true so isGatewayAvailable
  // doesn't reject in the package's paymentRouter.
  const cfg = {
    primaryGateway: 'stripe',
    routingRule: 'primary_only',
    stripeEnabled: true,
    payzooEnabled: false,
    amountThreshold: 0,
    fallbackTimeoutMs: 5000,
    stripePublishableKey: 'pk_test',
    payzooPublicKey: '',
    maintenanceMode: false,
    maintenanceMessage: '',
    toObject: () => cfg,
  };
  return {
    findOne: async () => cfg,
    create: async () => cfg,
  };
}

// ─── Stripe provider stub that records calls ────────────────────────────────

interface StripeCallLog {
  createCalls: Array<{ amount: number; orderId: string }>;
  cancelCalls: Array<{ gatewayTxnId: string; reason?: string }>;
}

function buildStripeProvider(opts: { log: StripeCallLog; failCreate?: boolean }): IPaymentProvider {
  const stripe: IPaymentProvider = {
    name: 'stripe',
    createPaymentIntent: (async (params: { amount: number; orderId: string }) => {
      opts.log.createCalls.push({ amount: params.amount, orderId: params.orderId });
      if (opts.failCreate) {
        throw new Error('createPaymentIntent failed');
      }
      return {
        gatewayTxnId: 'pi_test_intent_001',
        clientSecret: 'pi_test_intent_001_secret',
        gateway: 'stripe' as const,
        publishableKey: 'pk_test',
        status: 'requires_payment_method',
      };
    }) as IPaymentProvider['createPaymentIntent'],
    capturePayment: (async () => {
      throw new Error('capturePayment not exercised');
    }) as IPaymentProvider['capturePayment'],
    cancelPayment: (async (params: { gatewayTxnId: string; reason?: string }) => {
      opts.log.cancelCalls.push({ gatewayTxnId: params.gatewayTxnId, reason: params.reason });
      return { gatewayTxnId: params.gatewayTxnId, status: 'cancelled' };
    }) as IPaymentProvider['cancelPayment'],
    refundPayment: (async () => {
      throw new Error('refundPayment not exercised');
    }) as IPaymentProvider['refundPayment'],
    getPaymentStatus: (async () => {
      throw new Error('getPaymentStatus not exercised');
    }) as IPaymentProvider['getPaymentStatus'],
    testConnection: async () => true,
  };
  return stripe;
}

// ─── Stub services that record calls ────────────────────────────────────────

interface CreditCallLog {
  useCalls: Array<{ userId: string; amount: number; orderId: string }>;
  refundCalls: Array<{ userId: string; amount: number; description: string; orderId?: string }>;
}

function buildCreditService(opts: {
  balance: number;
  log: CreditCallLog;
  failUseCredit?: boolean;
}): CreditServiceResult {
  return {
    getBalance: async () => opts.balance,
    addCredit: (async (
      userId: string,
      amount: number,
      _type: string,
      description: string,
      referenceId?: string,
    ) => {
      opts.log.refundCalls.push({ userId, amount, description, orderId: referenceId });
      return { _id: 'credit_refund_id' } as never;
    }) as CreditServiceResult['addCredit'],
    useCredit: (async (userId: string, amount: number, orderId: string) => {
      opts.log.useCalls.push({ userId, amount, orderId });
      if (opts.failUseCredit) {
        throw new Error('useCredit failed');
      }
      return { _id: 'credit_use_id' } as never;
    }) as CreditServiceResult['useCredit'],
    getTransactions: (async () => ({
      transactions: [],
      total: 0,
    })) as CreditServiceResult['getTransactions'],
    expireCredits: (async () => 0) as CreditServiceResult['expireCredits'],
  };
}

interface PromoCallLog {
  applyCalls: Array<{ code: string; userId: string; orderId: string; orderAmount: number }>;
  revokeCalls: Array<{ code: string; userId: string; orderId: string }>;
}

function buildPromoService(opts: {
  discount: number;
  log: PromoCallLog;
  failApply?: boolean;
}): PromoCodeServiceResult {
  return {
    createPromoCode: (async () => ({}) as never) as PromoCodeServiceResult['createPromoCode'],
    validatePromoCode: (async (code: string) => ({
      valid: true,
      calculatedDiscount: opts.discount,
      promoCodeId: 'fake_promo_id',
      message: undefined,
      code,
    })) as unknown as PromoCodeServiceResult['validatePromoCode'],
    applyPromoCode: (async (code: string, userId: string, orderId: string, orderAmount: number) => {
      opts.log.applyCalls.push({ code, userId, orderId, orderAmount });
      if (opts.failApply) {
        throw new Error('applyPromoCode failed');
      }
      return { discountApplied: opts.discount };
    }) as PromoCodeServiceResult['applyPromoCode'],
    revokePromoCode: (async (code: string, userId: string, orderId: string) => {
      opts.log.revokeCalls.push({ code, userId, orderId });
      return 1;
    }) as PromoCodeServiceResult['revokePromoCode'],
    listPromoCodes: (async () => ({
      promoCodes: [],
      total: 0,
      page: 1,
      limit: 20,
    })) as PromoCodeServiceResult['listPromoCodes'],
    getPromoCode: (async () => ({}) as never) as PromoCodeServiceResult['getPromoCode'],
    updatePromoCode: (async () => ({}) as never) as PromoCodeServiceResult['updatePromoCode'],
    deactivatePromoCode: (async () =>
      ({}) as never) as PromoCodeServiceResult['deactivatePromoCode'],
    getPromoCodeUsage: (async () => []) as PromoCodeServiceResult['getPromoCodeUsage'],
  };
}

// ─── App factory ────────────────────────────────────────────────────────────

interface MountResult {
  app: express.Express;
  creditLog: CreditCallLog;
  promoLog: PromoCallLog;
  stripeLog: StripeCallLog;
  paymentStore: { last: StoredPayment | null };
  order: StoredOrder;
}

function mount(opts: {
  order: StoredOrder;
  failStripeCreate?: boolean;
  failUseCredit?: boolean;
  failPromoApply?: boolean;
  failOrderSave?: boolean;
}): MountResult {
  const creditLog: CreditCallLog = { useCalls: [], refundCalls: [] };
  const promoLog: PromoCallLog = { applyCalls: [], revokeCalls: [] };
  const stripeLog: StripeCallLog = { createCalls: [], cancelCalls: [] };
  const paymentStore: { last: StoredPayment | null } = { last: null };

  if (opts.failOrderSave) {
    let firstCall = true;
    opts.order.save = async (): Promise<void> => {
      if (firstCall) {
        firstCall = false;
        throw new Error('order.save failed');
      }
      // compensation save succeeds
    };
  }

  const authenticate = (): RequestHandler => {
    return (req: Request, _res: Response, next: NextFunction): void => {
      (req as unknown as Record<string, unknown>).user = {
        userId: CLIENT_ID,
        _id: CLIENT_ID,
      };
      next();
    };
  };

  const router = createPayOrderRoutes({
    OrderModel: buildOrderModel(opts.order) as never,
    PaymentModel: buildPaymentModel(paymentStore) as never,
    GatewayConfigModel: buildGatewayConfigModel() as never,
    providers: new Map([
      ['stripe', buildStripeProvider({ log: stripeLog, failCreate: opts.failStripeCreate })],
    ]) as never,
    authenticate,
    creditService: buildCreditService({
      balance: CREDIT_BALANCE,
      log: creditLog,
      failUseCredit: opts.failUseCredit,
    }),
    promoCodeService: buildPromoService({
      discount: PROMO_DISCOUNT,
      log: promoLog,
      failApply: opts.failPromoApply,
    }),
  });

  const app = express();
  app.use(express.json());
  app.use('/portal', router);

  return { app, creditLog, promoLog, stripeLog, paymentStore, order: opts.order };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('E2E: Pay Now partial-Stripe path — saga compensation', () => {
  it('happy path: all 5 steps run, response includes clientSecret, no compensations', async () => {
    const order = makeOrder();
    const { app, creditLog, promoLog, stripeLog, paymentStore } = mount({ order });

    const res = await request(app).post(`/portal/orders/${ORDER_ID}/pay`).send({
      promoCode: 'SAVE20',
      useCredits: true,
      idempotencyKey: 'idem_partial_happy_001',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.clientSecret).toBe('pi_test_intent_001_secret');
    expect(res.body.data.gateway).toBe('stripe');

    // Forward steps all ran exactly once.
    expect(stripeLog.createCalls).toHaveLength(1);
    expect(creditLog.useCalls).toHaveLength(1);
    expect(promoLog.applyCalls).toHaveLength(1);

    // No compensations.
    expect(stripeLog.cancelCalls).toHaveLength(0);
    expect(creditLog.refundCalls).toHaveLength(0);
    expect(promoLog.revokeCalls).toHaveLength(0);

    // Payment persisted, not flagged compensated.
    expect(paymentStore.last).not.toBeNull();
    expect(paymentStore.last?.status).toBe('pending');
    expect(paymentStore.last?.domainCompensated).toBeUndefined();

    // Order updated provisionally.
    expect(order.creditApplied).toBe(CREDIT_BALANCE);
    expect(order.promoCode).toBe('SAVE20');
  });

  it('order.save throws: every prior compensation fires in reverse', async () => {
    const order = makeOrder();
    const { app, creditLog, promoLog, stripeLog, paymentStore } = mount({
      order,
      failOrderSave: true,
    });

    const res = await request(app).post(`/portal/orders/${ORDER_ID}/pay`).send({
      promoCode: 'SAVE20',
      useCredits: true,
      idempotencyKey: 'idem_partial_ordersave_fail_001',
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toContain('order.save failed');

    // All forward steps before the failure ran.
    expect(stripeLog.createCalls).toHaveLength(1);
    expect(creditLog.useCalls).toHaveLength(1);
    expect(promoLog.applyCalls).toHaveLength(1);

    // Compensations: promo revoke, credit refund, payment cancel, stripe cancel.
    expect(promoLog.revokeCalls).toHaveLength(1);
    expect(creditLog.refundCalls).toHaveLength(1);
    expect(creditLog.refundCalls[0].amount).toBe(CREDIT_BALANCE);
    expect(creditLog.refundCalls[0].description).toMatch(/Saga compensation.*partial-Stripe/);
    expect(stripeLog.cancelCalls).toHaveLength(1);
    expect(stripeLog.cancelCalls[0].gatewayTxnId).toBe('pi_test_intent_001');
    expect(stripeLog.cancelCalls[0].reason).toBe('abandoned');

    // Payment was marked cancelled + domainCompensated (so the listener
    // won't double-refund when our cancelPayment fires the webhook).
    expect(paymentStore.last?.status).toBe('cancelled');
    expect(paymentStore.last?.domainCompensated).toBe(true);
    expect(paymentStore.last?.domainCompensatedAt).toBeInstanceOf(Date);

    // Order restored to pre-saga state.
    expect(order.paymentStatus).toBe('pending');
    expect(order.creditApplied ?? 0).toBe(0);
    expect(order.promoCode).toBeUndefined();
  });

  it('applyPromoCode throws: useCredit refund + payment cancel + stripe cancel fire (no promo revoke)', async () => {
    const order = makeOrder();
    const { app, creditLog, promoLog, stripeLog, paymentStore } = mount({
      order,
      failPromoApply: true,
    });

    const res = await request(app).post(`/portal/orders/${ORDER_ID}/pay`).send({
      promoCode: 'BROKEN',
      useCredits: true,
      idempotencyKey: 'idem_partial_promo_fail_001',
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toContain('applyPromoCode failed');

    expect(stripeLog.createCalls).toHaveLength(1);
    expect(creditLog.useCalls).toHaveLength(1);
    expect(promoLog.applyCalls).toHaveLength(1);

    // No promo revoke (apply never completed).
    expect(promoLog.revokeCalls).toHaveLength(0);
    // Credit refund fires.
    expect(creditLog.refundCalls).toHaveLength(1);
    // Payment marked cancelled + Stripe intent cancelled.
    expect(stripeLog.cancelCalls).toHaveLength(1);
    expect(paymentStore.last?.status).toBe('cancelled');
    expect(paymentStore.last?.domainCompensated).toBe(true);
  });

  it('useCredit throws: only payment cancel + stripe cancel fire (credit + promo never ran)', async () => {
    const order = makeOrder();
    const { app, creditLog, promoLog, stripeLog, paymentStore } = mount({
      order,
      failUseCredit: true,
    });

    const res = await request(app).post(`/portal/orders/${ORDER_ID}/pay`).send({
      promoCode: 'SAVE20',
      useCredits: true,
      idempotencyKey: 'idem_partial_credit_fail_001',
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toContain('useCredit failed');

    // Forward: stripe + persist + useCredit attempted.
    expect(stripeLog.createCalls).toHaveLength(1);
    expect(creditLog.useCalls).toHaveLength(1);
    expect(promoLog.applyCalls).toHaveLength(0); // never reached

    // Compensations: no credit refund (forward didn't complete), no
    // promo revoke (never ran). Payment marked cancelled + Stripe
    // intent cancelled.
    expect(creditLog.refundCalls).toHaveLength(0);
    expect(promoLog.revokeCalls).toHaveLength(0);
    expect(stripeLog.cancelCalls).toHaveLength(1);
    expect(paymentStore.last?.status).toBe('cancelled');
    expect(paymentStore.last?.domainCompensated).toBe(true);
  });
});
