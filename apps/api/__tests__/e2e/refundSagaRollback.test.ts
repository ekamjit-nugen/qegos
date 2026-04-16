/**
 * E2E: Admin "full refund" route — saga rollback on partial failure
 *
 * The route POST /admin/payments/:paymentId/full-refund mutates four
 * pieces of state in sequence:
 *
 *   0. Stripe processRefund — IRREVERSIBLE, runs first, NOT inside saga.
 *   1. addCredit (re-credit user the amount originally paid in credits)
 *   2. revokePromoCode (decrement promo usage, delete usage row)
 *   3. order.save with paymentStatus='refunded' (or 'partially_refunded')
 *
 * Steps 1–3 are inside `runSaga('refund.domainSync', ...)`. The Stripe
 * call itself is never compensated — only DOMAIN consistency is restored.
 *
 * This suite mounts the real createRefundRoutes against in-memory mocks
 * and proves:
 *
 *   1. Happy path — Stripe + all 3 saga steps run, no compensations,
 *      order.paymentStatus='refunded', credit added back, promo revoked.
 *   2. Promo revoke step throws — credit re-credit was already done, so
 *      its compensation (useCredit) fires; order status NEVER flipped.
 *   3. Order-save step throws — BOTH preceding compensations fire in
 *      reverse: promo re-applied, credit deducted again.
 *   4. Stripe processRefund throws — saga never runs, no domain mutation.
 *
 * If anyone weakens the saga wrapper or skips the domain restoration,
 * this suite catches the regression — and protects users from losing
 * credits / having promo usage stuck on a refunded order.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const request = require('supertest') as typeof import('supertest').default;
import type { Request, Response, NextFunction, RequestHandler } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const express = require('express') as typeof import('express').default;

import type { IPaymentProvider } from '@nugen/payment-gateway';
import type { PromoCodeServiceResult } from '../../src/modules/promo-code/promoCode.service';
import type { CreditServiceResult } from '../../src/modules/credit/credit.service';

// ─── Mock @nugen/payment-gateway's processRefund ───────────────────────────
// processRefund is a module-level function (not DI'd) that talks to Stripe
// and updates Payment state. The route imports it directly. Mocking the
// package lets us drive Step 0 outcomes without spinning up Stripe.

const processRefundMock = jest.fn();

jest.mock('@nugen/payment-gateway', () => {
  const actual = jest.requireActual('@nugen/payment-gateway');
  return {
    ...actual,
    processRefund: (...args: unknown[]) => processRefundMock(...args),
  };
});

// ─── Mock @nugen/audit-log so we can assert what gets logged ───────────────
// The route logs success at one severity, idempotent replay at "warning",
// failure at "high", and failure-with-compensation-failure at "critical".
// Capturing the call lets us prove ops will see broken refunds.

const auditLogMock = jest.fn().mockResolvedValue(undefined);

jest.mock('@nugen/audit-log', () => ({
  log: (...args: unknown[]) => auditLogMock(...args),
  logFromRequest: jest.fn(),
}));

// Import AFTER the mock is registered so the route picks up the mocked
// processRefund instead of the real one.
// eslint-disable-next-line import/order
import { createRefundRoutes } from '../../src/modules/order-management/refund.routes';

// ─── Constants ──────────────────────────────────────────────────────────────

const ACTOR_ID = '670000000000000000000001';
const CLIENT_ID = '670000000000000000000010';
const ORDER_ID = '670000000000000000000020';
const PAYMENT_ID = '670000000000000000000030';
const TOTAL = 30000; // $300
const CREDIT_APPLIED = 10000; // $100 of credit applied at checkout
const DISCOUNT = 5000; // $50 promo discount
const PROMO_CODE = 'SAVE50';

// ─── In-memory order ────────────────────────────────────────────────────────

interface StoredOrder {
  _id: string;
  userId: string;
  orderNumber: string;
  totalAmount: number;
  paymentStatus: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded';
  isDeleted: boolean;
  discountAmount?: number;
  promoCode?: string;
  creditApplied?: number;
  finalAmount?: number;
  save: () => Promise<void>;
}

function makeOrder(overrides?: Partial<StoredOrder>): StoredOrder {
  const order: StoredOrder = {
    _id: ORDER_ID,
    userId: CLIENT_ID,
    orderNumber: 'QGS-O-0001',
    totalAmount: TOTAL,
    paymentStatus: 'succeeded',
    isDeleted: false,
    creditApplied: CREDIT_APPLIED,
    promoCode: PROMO_CODE,
    discountAmount: DISCOUNT,
    finalAmount: TOTAL - DISCOUNT - CREDIT_APPLIED,
    save: async (): Promise<void> => {
      // re-bound per test when we want to simulate save failure
    },
    ...overrides,
  };
  return order;
}

function buildOrderModel(order: StoredOrder): unknown {
  return {
    findById: async (id: string): Promise<StoredOrder | null> => {
      if (id !== order._id) {
        return null;
      }
      if (order.isDeleted) {
        return null;
      }
      return order;
    },
  };
}

// PaymentModel is only used for the initial findById().lean() lookup; the
// actual refund mutation happens inside processRefund (mocked).

function buildPaymentModel(): unknown {
  return {
    findById: (id: string) => ({
      lean: async (): Promise<Record<string, unknown> | null> => {
        if (id !== PAYMENT_ID) {
          return null;
        }
        return {
          _id: PAYMENT_ID,
          orderId: ORDER_ID,
          userId: CLIENT_ID,
          status: 'succeeded',
          amount: TOTAL,
        };
      },
    }),
  };
}

// providers Map isn't exercised on this route directly (processRefund owns
// the Stripe call) — minimal stub that throws if hit.

function buildStripeProviderStub(): IPaymentProvider {
  const fail = async (): Promise<never> => {
    throw new Error('Stripe provider unexpectedly invoked from refund route');
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
  // refundCalls: re-credits issued to the user (saga forward step)
  refundCalls: Array<{ userId: string; amount: number; type: string; description: string }>;
  // useCalls: deductions (compensation when re-credit needs to be undone)
  useCalls: Array<{ userId: string; amount: number; orderId: string }>;
}

function buildCreditService(opts: {
  log: CreditCallLog;
  failAddCredit?: boolean;
  /**
   * Optional pre-existing `refund_credit` total for this order — used
   * to simulate the second of a partial-then-full sequence, where the
   * completing call must read priorRestored and top up the remainder.
   */
  priorRestoredCents?: number;
}): CreditServiceResult {
  return {
    getBalance: async () => 0,
    addCredit: (async (userId: string, amount: number, type: string, description: string) => {
      opts.log.refundCalls.push({ userId, amount, type, description });
      if (opts.failAddCredit) {
        throw new Error('addCredit failed');
      }
      return { _id: 'credit_refund_id' } as never;
    }) as CreditServiceResult['addCredit'],
    useCredit: (async (userId: string, amount: number, orderId: string) => {
      opts.log.useCalls.push({ userId, amount, orderId });
      return { _id: 'credit_use_id' } as never;
    }) as CreditServiceResult['useCredit'],
    getTransactions: (async () => ({
      transactions: [],
      total: 0,
    })) as CreditServiceResult['getTransactions'],
    getRestoredCreditForOrder: (async () =>
      opts.priorRestoredCents ?? 0) as CreditServiceResult['getRestoredCreditForOrder'],
    expireCredits: (async () => 0) as CreditServiceResult['expireCredits'],
  };
}

interface PromoCallLog {
  applyCalls: Array<{ code: string; userId: string; orderId: string; orderAmount: number }>;
  revokeCalls: Array<{ code: string; userId: string; orderId: string }>;
}

function buildPromoService(opts: {
  log: PromoCallLog;
  failRevoke?: boolean;
}): PromoCodeServiceResult {
  return {
    createPromoCode: (async () => ({}) as never) as PromoCodeServiceResult['createPromoCode'],
    validatePromoCode: (async () => ({
      valid: true,
    })) as unknown as PromoCodeServiceResult['validatePromoCode'],
    applyPromoCode: (async (code: string, userId: string, orderId: string, orderAmount: number) => {
      opts.log.applyCalls.push({ code, userId, orderId, orderAmount });
      return { discountApplied: DISCOUNT };
    }) as PromoCodeServiceResult['applyPromoCode'],
    revokePromoCode: (async (code: string, userId: string, orderId: string) => {
      opts.log.revokeCalls.push({ code, userId, orderId });
      if (opts.failRevoke) {
        throw new Error('revokePromoCode failed');
      }
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
  failAddCredit?: boolean;
  failRevoke?: boolean;
  failOrderSave?: boolean;
  priorRestoredCents?: number;
}): {
  app: express.Express;
  creditLog: CreditCallLog;
  promoLog: PromoCallLog;
  order: StoredOrder;
} {
  const creditLog: CreditCallLog = { refundCalls: [], useCalls: [] };
  const promoLog: PromoCallLog = { applyCalls: [], revokeCalls: [] };

  // If failOrderSave is set, replace the order's `save` so the third
  // saga step throws after credits + promo have already been re-applied.
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

  const authenticate = (): RequestHandler => {
    return (req: Request, _res: Response, next: NextFunction): void => {
      (req as unknown as Record<string, unknown>).user = {
        userId: ACTOR_ID,
        _id: ACTOR_ID,
        userType: 0, // super_admin
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

  const router = createRefundRoutes({
    PaymentModel: buildPaymentModel() as never,
    OrderModel: buildOrderModel(opts.order) as never,
    providers: new Map([['stripe', buildStripeProviderStub()]]) as never,
    authenticate,
    checkPermission: checkPermission as never,
    creditService: buildCreditService({
      log: creditLog,
      failAddCredit: opts.failAddCredit,
      priorRestoredCents: opts.priorRestoredCents,
    }),
    promoCodeService: buildPromoService({
      log: promoLog,
      failRevoke: opts.failRevoke,
    }),
  });

  const app = express();
  app.use(express.json());
  app.use('/api', router);

  return { app, creditLog, promoLog, order: opts.order };
}

// ─── Default mock for processRefund: returns a successful FULL refund ─────

function defaultProcessRefundResult(): Record<string, unknown> {
  return {
    refundEntry: {
      refundId: 'rf_test_01',
      amount: TOTAL,
      status: 'succeeded',
    },
    payment: {
      _id: PAYMENT_ID,
      paymentNumber: 'QGS-P-0001',
      userId: CLIENT_ID,
      orderId: ORDER_ID,
      status: 'refunded', // full refund — triggers the credit + promo restoration branch
      refundedAmount: TOTAL,
    },
    requiredApproval: 'super_admin',
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('E2E: Admin full-refund route — saga compensation', () => {
  beforeEach(() => {
    processRefundMock.mockReset();
    auditLogMock.mockClear();
  });

  it('happy path: Stripe + reCreditUser + revokePromoCode + flipOrderStatus all run, no compensations', async () => {
    processRefundMock.mockResolvedValue(defaultProcessRefundResult());

    const order = makeOrder();
    const { app, creditLog, promoLog } = mount({ order });

    const res = await request(app).post(`/api/admin/payments/${PAYMENT_ID}/full-refund`).send({
      reason: 'Customer requested cancellation',
      idempotencyKey: 'idem_refund_happy_001',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.domainRestored).toBe(true);
    expect(res.body.data.orderPaymentStatus).toBe('refunded');

    // Forward effects all ran.
    expect(processRefundMock).toHaveBeenCalledTimes(1);
    expect(creditLog.refundCalls).toHaveLength(1);
    expect(creditLog.refundCalls[0].amount).toBe(CREDIT_APPLIED);
    expect(creditLog.refundCalls[0].type).toBe('refund_credit');
    expect(promoLog.revokeCalls).toHaveLength(1);
    expect(promoLog.revokeCalls[0].code).toBe(PROMO_CODE);
    expect(order.paymentStatus).toBe('refunded');

    // No compensations.
    expect(creditLog.useCalls).toHaveLength(0);
    expect(promoLog.applyCalls).toHaveLength(0);
  });

  it('revokePromoCode throws: reCreditUser compensation fires, order status NOT flipped', async () => {
    processRefundMock.mockResolvedValue(defaultProcessRefundResult());

    const order = makeOrder();
    const originalStatus = order.paymentStatus;
    const { app, creditLog, promoLog } = mount({ order, failRevoke: true });

    const res = await request(app).post(`/api/admin/payments/${PAYMENT_ID}/full-refund`).send({
      reason: 'Customer requested',
      idempotencyKey: 'idem_refund_promo_fail_001',
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toContain('revokePromoCode failed');

    // Forward: Stripe + re-credit ran; promo revoke attempted.
    expect(processRefundMock).toHaveBeenCalledTimes(1);
    expect(creditLog.refundCalls).toHaveLength(1);
    expect(promoLog.revokeCalls).toHaveLength(1);

    // Compensation: re-credit reversed via useCredit. Promo apply NEVER
    // called (the forward step never completed).
    expect(creditLog.useCalls).toHaveLength(1);
    expect(creditLog.useCalls[0].amount).toBe(CREDIT_APPLIED);
    expect(promoLog.applyCalls).toHaveLength(0);

    // Order status untouched — flipOrderStatus never ran.
    expect(order.paymentStatus).toBe(originalStatus);
  });

  it('order.save throws: BOTH preceding compensations fire in REVERSE order', async () => {
    processRefundMock.mockResolvedValue(defaultProcessRefundResult());

    const order = makeOrder();
    const { app, creditLog, promoLog } = mount({ order, failOrderSave: true });

    const res = await request(app).post(`/api/admin/payments/${PAYMENT_ID}/full-refund`).send({
      reason: 'Customer requested',
      idempotencyKey: 'idem_refund_save_fail_001',
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toContain('order.save failed');

    // Both forward steps completed before order.save threw.
    expect(creditLog.refundCalls).toHaveLength(1);
    expect(promoLog.revokeCalls).toHaveLength(1);

    // Both compensations fired (order: promo re-applied, credit deducted).
    expect(promoLog.applyCalls).toHaveLength(1);
    expect(promoLog.applyCalls[0].orderAmount).toBe(TOTAL);
    expect(creditLog.useCalls).toHaveLength(1);
    expect(creditLog.useCalls[0].amount).toBe(CREDIT_APPLIED);
  });

  it('Stripe processRefund throws: NO domain mutation (saga never runs)', async () => {
    processRefundMock.mockRejectedValue(new Error('Stripe API rejected'));

    const order = makeOrder();
    const originalStatus = order.paymentStatus;
    const { app, creditLog, promoLog } = mount({ order });

    const res = await request(app).post(`/api/admin/payments/${PAYMENT_ID}/full-refund`).send({
      reason: 'Customer requested',
      idempotencyKey: 'idem_refund_stripe_fail_001',
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toContain('Stripe API rejected');

    // Stripe was attempted; nothing else was touched.
    expect(processRefundMock).toHaveBeenCalledTimes(1);
    expect(creditLog.refundCalls).toHaveLength(0);
    expect(creditLog.useCalls).toHaveLength(0);
    expect(promoLog.revokeCalls).toHaveLength(0);
    expect(promoLog.applyCalls).toHaveLength(0);
    expect(order.paymentStatus).toBe(originalStatus);
  });

  // ── Partial refund: prorated credit restoration ────────────────────────
  // Order economics for these tests:
  //   totalAmount   = 30000  ($300 order)
  //   discountAmount=  5000  ($50 promo)
  //   creditApplied = 10000  ($100 credit applied at checkout)
  //   finalAmount   = 15000  ($150 charged via Stripe)
  //
  // Partial refund of $75 = 7500 cents (50% of finalAmount):
  //   creditToRestore = floor(10000 * 7500 / 15000) = 5000 cents = $50
  //   promo: NOT revoked (v1: only revoked on completing call)
  //   order.paymentStatus → 'partially_refunded'

  it('partial refund: PROPORTIONAL credit restored, promo untouched, status partial', async () => {
    processRefundMock.mockResolvedValue({
      refundEntry: { refundId: 'rf_partial_01', amount: 7500, status: 'succeeded' },
      payment: {
        _id: PAYMENT_ID,
        paymentNumber: 'QGS-P-0001',
        userId: CLIENT_ID,
        orderId: ORDER_ID,
        status: 'partially_refunded', // still has captured amount > refunded
        refundedAmount: 7500,
      },
      requiredApproval: 'none',
    });

    const order = makeOrder();
    const { app, creditLog, promoLog } = mount({ order });

    const res = await request(app).post(`/api/admin/payments/${PAYMENT_ID}/full-refund`).send({
      reason: 'Partial refund — disputed line item',
      idempotencyKey: 'idem_refund_partial_001',
      amount: 7500,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.orderPaymentStatus).toBe('partially_refunded');
    expect(res.body.data.domainRestored).toBe(true); // proportional credit restored

    // Credit restored proportionally: floor(10000 * 7500 / 15000) = 5000.
    expect(creditLog.refundCalls).toHaveLength(1);
    expect(creditLog.refundCalls[0].amount).toBe(5000);
    expect(creditLog.refundCalls[0].type).toBe('refund_credit');
    expect(creditLog.refundCalls[0].description).toContain('partial');

    // Promo NOT revoked on partial — v1 keeps the promo counted until the
    // refund completes.
    expect(promoLog.revokeCalls).toHaveLength(0);
    expect(promoLog.applyCalls).toHaveLength(0);

    // Order status flipped, no compensations.
    expect(order.paymentStatus).toBe('partially_refunded');
    expect(creditLog.useCalls).toHaveLength(0);
  });

  it('completing call after partials: tops up exact remainder + revokes promo (rounding-drift fix)', async () => {
    // Sequence:
    //   prior partial refunded $50 (3333 cents would have been restored
    //   under floor proportional math if finalAmount were 15000 and
    //   creditApplied 10000: floor(10000 * 5000 / 15000) = 3333).
    //
    // Now this call completes the refund: another $100 = 10000 cents.
    // payment.status will be 'refunded' (cumulative refundedAmount =
    // 15000 = capturedAmount).
    //
    // Without top-up: floor(10000 * 10000 / 15000) = 6666 cents → total
    // restored = 3333 + 6666 = 9999 — short by 1 cent.
    //
    // With top-up: creditToRestore = creditApplied - priorRestored =
    // 10000 - 3333 = 6667 cents → total = 3333 + 6667 = 10000 exact.

    processRefundMock.mockResolvedValue({
      refundEntry: { refundId: 'rf_complete_02', amount: 10000, status: 'succeeded' },
      payment: {
        _id: PAYMENT_ID,
        paymentNumber: 'QGS-P-0001',
        userId: CLIENT_ID,
        orderId: ORDER_ID,
        status: 'refunded', // cumulative refundedAmount === capturedAmount
        refundedAmount: 15000,
      },
      requiredApproval: 'admin',
    });

    // Prior partial already restored 3333 cents (the floor of the first
    // partial's proportional share).
    const order = makeOrder({ paymentStatus: 'partially_refunded' });
    const { app, creditLog, promoLog } = mount({ order, priorRestoredCents: 3333 });

    const res = await request(app).post(`/api/admin/payments/${PAYMENT_ID}/full-refund`).send({
      reason: 'Completing the partial sequence',
      idempotencyKey: 'idem_refund_complete_002',
      amount: 10000,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.orderPaymentStatus).toBe('refunded');
    expect(res.body.data.domainRestored).toBe(true);

    // Credit restored exactly equals creditApplied - priorRestored.
    expect(creditLog.refundCalls).toHaveLength(1);
    expect(creditLog.refundCalls[0].amount).toBe(CREDIT_APPLIED - 3333); // 6667
    // Sanity: cumulative restoration equals creditApplied (no drift).
    expect(3333 + creditLog.refundCalls[0].amount).toBe(CREDIT_APPLIED);

    // Promo IS revoked on the completing call.
    expect(promoLog.revokeCalls).toHaveLength(1);
    expect(promoLog.revokeCalls[0].code).toBe(PROMO_CODE);

    // Order flipped to 'refunded'.
    expect(order.paymentStatus).toBe('refunded');

    // No compensations.
    expect(creditLog.useCalls).toHaveLength(0);
    expect(promoLog.applyCalls).toHaveLength(0);
  });

  it('partial refund: order.save throws → proportional credit re-credit is COMPENSATED', async () => {
    // Failure on the third (status flip) saga step on a partial refund.
    // The proportional re-credit must be reversed via useCredit so the
    // user does NOT keep the partial credit while the order stays
    // 'succeeded'.
    processRefundMock.mockResolvedValue({
      refundEntry: { refundId: 'rf_partial_fail_03', amount: 7500, status: 'succeeded' },
      payment: {
        _id: PAYMENT_ID,
        paymentNumber: 'QGS-P-0001',
        userId: CLIENT_ID,
        orderId: ORDER_ID,
        status: 'partially_refunded',
        refundedAmount: 7500,
      },
      requiredApproval: 'none',
    });

    const order = makeOrder();
    const originalStatus = order.paymentStatus;
    const { app, creditLog, promoLog } = mount({ order, failOrderSave: true });

    const res = await request(app).post(`/api/admin/payments/${PAYMENT_ID}/full-refund`).send({
      reason: 'Partial refund test',
      idempotencyKey: 'idem_refund_partial_fail_003',
      amount: 7500,
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toContain('order.save failed');

    // Forward: proportional re-credit ran.
    expect(creditLog.refundCalls).toHaveLength(1);
    expect(creditLog.refundCalls[0].amount).toBe(5000);

    // Compensation: re-credit reversed via useCredit for the SAME amount.
    expect(creditLog.useCalls).toHaveLength(1);
    expect(creditLog.useCalls[0].amount).toBe(5000);
    expect(creditLog.useCalls[0].orderId).toBe(ORDER_ID);

    // Promo never touched on partials — no apply/revoke calls.
    expect(promoLog.revokeCalls).toHaveLength(0);
    expect(promoLog.applyCalls).toHaveLength(0);

    // Order status untouched.
    expect(order.paymentStatus).toBe(originalStatus);
  });

  it('partial refund: idempotency guard does NOT skip when order already partially_refunded', async () => {
    // The full-refund idempotency guard would skip if order.paymentStatus
    // matched the target. For partial refunds, the order can sit in
    // 'partially_refunded' across many sequential calls — so the guard
    // MUST NOT short-circuit. processRefund's capturedAmount check is
    // the boundary that prevents over-refunding.
    processRefundMock.mockResolvedValue({
      refundEntry: { refundId: 'rf_partial_repeat_04', amount: 3000, status: 'succeeded' },
      payment: {
        _id: PAYMENT_ID,
        paymentNumber: 'QGS-P-0001',
        userId: CLIENT_ID,
        orderId: ORDER_ID,
        status: 'partially_refunded',
        refundedAmount: 6000, // a previous partial of 3000 already happened
      },
      requiredApproval: 'none',
    });

    // Order is ALREADY 'partially_refunded' from the first partial.
    const order = makeOrder({ paymentStatus: 'partially_refunded' });
    const { app, creditLog } = mount({ order, priorRestoredCents: 2000 });

    const res = await request(app).post(`/api/admin/payments/${PAYMENT_ID}/full-refund`).send({
      reason: 'Second partial refund',
      idempotencyKey: 'idem_refund_partial_repeat_004',
      amount: 3000,
    });

    expect(res.status).toBe(200);
    // NOT skipped as idempotent — saga ran, proportional credit restored.
    expect(res.body.data.idempotentReplay).toBeUndefined();
    expect(res.body.data.domainRestored).toBe(true);

    // floor(10000 * 3000 / 15000) = 2000 cents restored for THIS call.
    // (The priorRestoredCents of 2000 is only relevant to the COMPLETING
    // call — proportional partials do not consult it.)
    expect(creditLog.refundCalls).toHaveLength(1);
    expect(creditLog.refundCalls[0].amount).toBe(2000);
  });

  it('partial refund on order with NO credit/promo: saga runs but no credit step', async () => {
    // Order paid entirely in cash — no creditApplied, no promo. Partial
    // refund should still flip order status to 'partially_refunded' but
    // run no credit-restore step.
    processRefundMock.mockResolvedValue({
      refundEntry: { refundId: 'rf_partial_cash_05', amount: 5000, status: 'succeeded' },
      payment: {
        _id: PAYMENT_ID,
        paymentNumber: 'QGS-P-0001',
        userId: CLIENT_ID,
        orderId: ORDER_ID,
        status: 'partially_refunded',
        refundedAmount: 5000,
      },
      requiredApproval: 'none',
    });

    const order = makeOrder({
      creditApplied: 0,
      promoCode: undefined,
      discountAmount: 0,
      finalAmount: TOTAL,
    });
    const { app, creditLog, promoLog } = mount({ order });

    const res = await request(app).post(`/api/admin/payments/${PAYMENT_ID}/full-refund`).send({
      reason: 'Partial refund on cash-only order',
      idempotencyKey: 'idem_refund_partial_cash_005',
      amount: 5000,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.orderPaymentStatus).toBe('partially_refunded');
    // Nothing to restore — domainRestored false (no credit + not full).
    expect(res.body.data.domainRestored).toBe(false);

    expect(creditLog.refundCalls).toHaveLength(0);
    expect(promoLog.revokeCalls).toHaveLength(0);
    expect(order.paymentStatus).toBe('partially_refunded');
  });

  // ── Idempotency guard ──────────────────────────────────────────────────
  // processRefund's status guard catches the common sequential double-click,
  // but a true concurrent race can slip both requests past. The route adds
  // a defensive check: if the order is already in the target refunded
  // state, the saga has already run for this refund — skip it. Without
  // this guard, addCredit (which doesn't dedupe on referenceId) would
  // double-credit the user.

  it('idempotent replay: order already in "refunded" state — saga is skipped, no double-credit', async () => {
    processRefundMock.mockResolvedValue(defaultProcessRefundResult());

    // Simulate the concurrent-race outcome: the order is ALREADY 'refunded'
    // by the time this request gets to the saga step (a parallel request
    // beat us to it).
    const order = makeOrder({ paymentStatus: 'refunded' });
    const { app, creditLog, promoLog } = mount({ order });

    const res = await request(app).post(`/api/admin/payments/${PAYMENT_ID}/full-refund`).send({
      reason: 'Concurrent retry',
      idempotencyKey: 'idem_refund_replay_001',
    });

    expect(res.status).toBe(200);
    // Critical: response signals this was a no-op replay.
    expect(res.body.data.idempotentReplay).toBe(true);
    expect(res.body.data.domainRestored).toBe(false);
    expect(res.body.data.orderPaymentStatus).toBe('refunded');

    // The saga did NOT run. No credit was issued, no promo revoked.
    expect(creditLog.refundCalls).toHaveLength(0);
    expect(creditLog.useCalls).toHaveLength(0);
    expect(promoLog.revokeCalls).toHaveLength(0);

    // Order status untouched (already 'refunded').
    expect(order.paymentStatus).toBe('refunded');

    // Audit log fired with 'warning' severity to flag the replay for ops.
    const replayLog = auditLogMock.mock.calls.find(
      (call) =>
        typeof call[0] === 'object' &&
        call[0] !== null &&
        (call[0] as { description?: string }).description?.includes('idempotent retry'),
    );
    expect(replayLog).toBeDefined();
    expect((replayLog![0] as { severity: string }).severity).toBe('warning');
  });

  // ── Audit log on failure ───────────────────────────────────────────────
  // The success path audit-logs every refund. Failures are MORE important
  // to surface (especially saga compensation failures, which leave the
  // domain partially restored after Stripe sent money back). Without this
  // audit entry, ops would have no record of the broken refund.

  it('saga failure: audit log fires with high severity', async () => {
    processRefundMock.mockResolvedValue(defaultProcessRefundResult());

    const order = makeOrder();
    const { app } = mount({ order, failRevoke: true });

    const res = await request(app).post(`/api/admin/payments/${PAYMENT_ID}/full-refund`).send({
      reason: 'Test failure audit',
      idempotencyKey: 'idem_refund_audit_fail_001',
    });

    expect(res.status).toBe(500);

    // The failure path MUST audit-log so ops sees broken refunds.
    const failureLog = auditLogMock.mock.calls.find(
      (call) =>
        typeof call[0] === 'object' &&
        call[0] !== null &&
        (call[0] as { description?: string }).description?.includes('FAILED'),
    );
    expect(failureLog).toBeDefined();
    expect((failureLog![0] as { severity: string }).severity).toBe('high');
    expect((failureLog![0] as { resourceId: string }).resourceId).toBe(PAYMENT_ID);
  });

  it('saga compensation failure: audit log fires with CRITICAL severity', async () => {
    processRefundMock.mockResolvedValue(defaultProcessRefundResult());

    // failOrderSave triggers the order.save throw AFTER re-credit + promo
    // revoke completed. To simulate a compensation failure, we'll make
    // the credit useCredit (compensation) throw too.
    const order = makeOrder();
    let firstCall = true;
    order.save = async (): Promise<void> => {
      if (firstCall) {
        firstCall = false;
        throw new Error('order.save failed');
      }
    };

    // Build a credit service whose useCredit (compensation) throws,
    // forcing a SagaCompensationError to bubble up.
    const creditLog: CreditCallLog = { refundCalls: [], useCalls: [] };
    const promoLog: PromoCallLog = { applyCalls: [], revokeCalls: [] };

    const router = createRefundRoutes({
      PaymentModel: buildPaymentModel() as never,
      OrderModel: buildOrderModel(order) as never,
      providers: new Map([['stripe', buildStripeProviderStub()]]) as never,
      authenticate: ((): RequestHandler =>
        (req: Request, _res: Response, next: NextFunction): void => {
          (req as unknown as Record<string, unknown>).user = {
            userId: ACTOR_ID,
            _id: ACTOR_ID,
            userType: 0,
          };
          next();
        }) as never,
      checkPermission: ((): ((_req: Request, _res: Response, next: NextFunction) => void) =>
        (_req: Request, _res: Response, next: NextFunction): void => {
          next();
        }) as never,
      creditService: {
        getBalance: async () => 0,
        addCredit: (async (userId: string, amount: number, type: string, description: string) => {
          creditLog.refundCalls.push({ userId, amount, type, description });
          return { _id: 'credit_refund_id' } as never;
        }) as CreditServiceResult['addCredit'],
        useCredit: (async (userId: string, amount: number, orderId: string) => {
          creditLog.useCalls.push({ userId, amount, orderId });
          throw new Error('useCredit compensation failed');
        }) as CreditServiceResult['useCredit'],
        getTransactions: (async () => ({
          transactions: [],
          total: 0,
        })) as CreditServiceResult['getTransactions'],
        getRestoredCreditForOrder: (async () =>
          0) as CreditServiceResult['getRestoredCreditForOrder'],
        expireCredits: (async () => 0) as CreditServiceResult['expireCredits'],
      },
      promoCodeService: buildPromoService({ log: promoLog }),
    });

    const app = express();
    app.use(express.json());
    app.use('/api', router);

    const res = await request(app).post(`/api/admin/payments/${PAYMENT_ID}/full-refund`).send({
      reason: 'Test critical audit',
      idempotencyKey: 'idem_refund_critical_001',
    });

    expect(res.status).toBe(500);
    // useCredit (compensation) was attempted — it threw.
    expect(creditLog.useCalls).toHaveLength(1);

    const criticalLog = auditLogMock.mock.calls.find(
      (call) =>
        typeof call[0] === 'object' &&
        call[0] !== null &&
        (call[0] as { description?: string }).description?.includes(
          'MANUAL RECONCILIATION REQUIRED',
        ),
    );
    expect(criticalLog).toBeDefined();
    expect((criticalLog![0] as { severity: string }).severity).toBe('critical');
  });
});
