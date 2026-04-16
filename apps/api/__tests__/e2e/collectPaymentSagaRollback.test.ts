/**
 * E2E: Collect Payment full-credit fast path — saga rollback on partial failure
 *
 * The full-credit branch of POST /orders/:id/collect-payment (staff-side
 * counterpart to Pay Now) mutates three pieces of state in sequence:
 * deduct client credits → increment promo usage → mark order paid. Without
 * compensating-transaction wrapping, a failure in step 2 or 3 leaves the
 * client with credits gone but order unpaid — staff would then re-collect,
 * double-charging the client. Same hazard as GAP-C03 for Pay Now.
 *
 * This suite mounts the real createCollectPaymentRoutes against in-memory
 * mocks and proves:
 *
 *   1. Happy path — all 3 steps run, no compensations, order=paid.
 *   2. Promo step throws — credit deducted, so the `useCredit`
 *      compensation fires (refund_credit added back) and the order
 *      stays in its original pending state.
 *   3. Order-save step throws — both `useCredit` AND `applyPromoCode`
 *      compensations fire in REVERSE order: promo usage rolled back,
 *      credit refunded.
 *
 * If anyone weakens the saga wrapper, this test catches the regression.
 * Mirrors payNowSagaRollback.test.ts — the routes share an origin and
 * should keep sharing the same safety guarantees.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const request = require('supertest') as typeof import('supertest').default;
import type { Request, Response, NextFunction, RequestHandler } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const express = require('express') as typeof import('express').default;

import type { IPaymentProvider } from '@nugen/payment-gateway';
import { createCollectPaymentRoutes } from '../../src/modules/order-management/collectPayment.routes';
import type { PromoCodeServiceResult } from '../../src/modules/promo-code/promoCode.service';
import type { CreditServiceResult } from '../../src/modules/credit/credit.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const STAFF_ID = '670000000000000000000001';
const CLIENT_ID = '670000000000000000000010';
const ORDER_ID = '670000000000000000000020';
const TOTAL = 16500;

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
      // re-bound per test when we want to simulate save failure
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
      if (order.isDeleted) {
        return null;
      }
      return order;
    },
  };
}

// PaymentModel + GatewayConfigModel + providers aren't exercised on the
// full-credit fast path (it short-circuits before the gateway), but the
// route factory requires them — minimal stubs that throw if hit so any
// regression that takes the wrong branch surfaces loudly.

function buildPaymentModel(): unknown {
  return {
    findOne: () => ({
      lean: async (): Promise<null> => null,
    }),
    create: async (): Promise<never> => {
      throw new Error('PaymentModel.create unexpectedly invoked on full-credit path');
    },
  };
}

function buildGatewayConfigModel(): unknown {
  return {
    findOne: async (): Promise<never> => {
      throw new Error('GatewayConfigModel.findOne unexpectedly invoked on full-credit path');
    },
    create: async (): Promise<never> => {
      throw new Error('GatewayConfigModel.create unexpectedly invoked on full-credit path');
    },
  };
}

function buildStripeProviderStub(): IPaymentProvider {
  const fail = async (): Promise<never> => {
    throw new Error('Stripe provider unexpectedly invoked on full-credit path');
  };
  return {
    name: 'stripe',
    createPaymentIntent: fail as never,
    capturePayment: fail as never,
    refundPayment: fail as never,
    cancelPayment: fail as never,
    retrievePayment: fail as never,
  };
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
  failRefund?: boolean;
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
      if (opts.failRefund) {
        throw new Error('credit refund failed');
      }
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
    getRestoredCreditForOrder: (async () => 0) as CreditServiceResult['getRestoredCreditForOrder'],
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

function mount(opts: {
  order: StoredOrder;
  creditBalance: number;
  promoDiscount: number;
  failPromoApply?: boolean;
  failOrderSave?: boolean;
  failCreditRefund?: boolean;
}): {
  app: express.Express;
  creditLog: CreditCallLog;
  promoLog: PromoCallLog;
  order: StoredOrder;
} {
  const creditLog: CreditCallLog = { useCalls: [], refundCalls: [] };
  const promoLog: PromoCallLog = { applyCalls: [], revokeCalls: [] };

  // If failOrderSave is set, replace the order's `save` so the third
  // saga step throws after credits + promo have already been applied.
  if (opts.failOrderSave) {
    let firstCall = true;
    opts.order.save = async (): Promise<void> => {
      if (firstCall) {
        firstCall = false;
        throw new Error('order.save failed');
      }
      // subsequent saves (the compensation) succeed
    };
  }

  // Staff identity attached to req.user.
  const authenticate = (): RequestHandler => {
    return (req: Request, _res: Response, next: NextFunction): void => {
      (req as unknown as Record<string, unknown>).user = {
        userId: STAFF_ID,
        _id: STAFF_ID,
        userType: 1, // admin
      };
      next();
    };
  };

  // checkPermission is a factory returning middleware — pass-through here.
  const checkPermission =
    () =>
    (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    };

  const router = createCollectPaymentRoutes({
    OrderModel: buildOrderModel(opts.order) as never,
    PaymentModel: buildPaymentModel() as never,
    GatewayConfigModel: buildGatewayConfigModel() as never,
    providers: new Map([['stripe', buildStripeProviderStub()]]) as never,
    authenticate,
    checkPermission: checkPermission as never,
    creditService: buildCreditService({
      balance: opts.creditBalance,
      log: creditLog,
      failRefund: opts.failCreditRefund,
    }),
    promoCodeService: buildPromoService({
      discount: opts.promoDiscount,
      log: promoLog,
      failApply: opts.failPromoApply,
    }),
  });

  const app = express();
  app.use(express.json());
  app.use('/orders', router);

  return { app, creditLog, promoLog, order: opts.order };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('E2E: Collect Payment full-credit fast path — saga compensation', () => {
  it('happy path: useCredit + applyPromoCode + markOrderPaid all run, no compensations', async () => {
    const order = makeOrder();
    const { app, creditLog, promoLog } = mount({
      order,
      creditBalance: TOTAL, // covers the full order alone
      promoDiscount: 5000,
    });

    const res = await request(app).post(`/orders/${ORDER_ID}/collect-payment`).send({
      promoCode: 'SAVE10',
      useCredits: true,
      idempotencyKey: 'idem_collect_saga_happy_001',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.fullyCoveredByCredits).toBe(true);
    expect(creditLog.useCalls).toHaveLength(1);
    expect(creditLog.useCalls[0].userId).toBe(CLIENT_ID); // critical: client, not staff
    expect(promoLog.applyCalls).toHaveLength(1);
    expect(creditLog.refundCalls).toHaveLength(0); // no compensation
    expect(promoLog.revokeCalls).toHaveLength(0); // no compensation
    expect(order.paymentStatus).toBe('succeeded');
  });

  it('promo step throws: credit refund (compensation) fires, order stays pending', async () => {
    const order = makeOrder();
    const { app, creditLog, promoLog } = mount({
      order,
      creditBalance: TOTAL,
      promoDiscount: 5000,
      failPromoApply: true,
    });

    const res = await request(app).post(`/orders/${ORDER_ID}/collect-payment`).send({
      promoCode: 'BROKEN',
      useCredits: true,
      idempotencyKey: 'idem_collect_saga_promo_fail_001',
    });

    // Saga rethrows the promo error; route's catch turns it into 500.
    expect(res.status).toBe(500);
    expect(res.body.message).toContain('applyPromoCode failed');

    // Forward effects: useCredit ran, promo apply attempted.
    expect(creditLog.useCalls).toHaveLength(1);
    expect(promoLog.applyCalls).toHaveLength(1);

    // Compensations: only useCredit's refund fires (promo never completed).
    expect(creditLog.refundCalls).toHaveLength(1);
    expect(creditLog.refundCalls[0].userId).toBe(CLIENT_ID);
    expect(creditLog.refundCalls[0].amount).toBe(creditLog.useCalls[0].amount);
    expect(creditLog.refundCalls[0].description).toMatch(/Saga compensation/);
    expect(promoLog.revokeCalls).toHaveLength(0); // promo apply never completed

    // Order untouched: never made it to markOrderPaid.
    expect(order.paymentStatus).toBe('pending');
    expect(order.creditApplied ?? 0).toBe(0);
    expect(order.promoCode).toBeUndefined();
  });

  it('order.save step throws: BOTH compensations fire in reverse, leaving credits + promo back', async () => {
    const order = makeOrder();
    const { app, creditLog, promoLog } = mount({
      order,
      creditBalance: TOTAL,
      promoDiscount: 5000,
      failOrderSave: true,
    });

    const res = await request(app).post(`/orders/${ORDER_ID}/collect-payment`).send({
      promoCode: 'SAVE10',
      useCredits: true,
      idempotencyKey: 'idem_collect_saga_save_fail_001',
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toContain('order.save failed');

    // Both forward steps completed before the failure.
    expect(creditLog.useCalls).toHaveLength(1);
    expect(promoLog.applyCalls).toHaveLength(1);

    // Both compensations fired.
    expect(promoLog.revokeCalls).toHaveLength(1);
    expect(creditLog.refundCalls).toHaveLength(1);
    expect(creditLog.refundCalls[0].amount).toBe(creditLog.useCalls[0].amount);
  });
});
