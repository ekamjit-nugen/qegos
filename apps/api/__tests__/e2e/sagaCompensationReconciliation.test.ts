/**
 * E2E: SagaCompensationError → reconciliation queue → admin response
 *
 * What this guards:
 *
 *   When a money-path saga's forward step fails AND one of its
 *   compensations also fails, we used to surface a generic 500 with
 *   only the saga's stringified error message. Ops had to grep logs
 *   to find affected payments, with no stable identifier to quote
 *   back to the customer.
 *
 *   Now: every SagaCompensationError flows through the reconciliation
 *   reporter (set in server bootstrap), persists a ticket row with
 *   the saga's metadata breadcrumbs, and the response carries
 *   `code: 'SAGA_COMPENSATION_FAILED'` + `ticketNumber` + `ticketId`
 *   + `manualReconciliationRequired: true`.
 *
 *   This suite drives the full chain end-to-end: real saga + real
 *   reconciliation service + in-memory ReconciliationItem store +
 *   real refund route. It proves:
 *
 *   1. SagaCompensationError → reporter is invoked, ticket is
 *      enqueued, response carries ticket fields.
 *   2. The saga's metadata (paymentId, orderId, userId, refundAmount,
 *      isFullRefund, actorId, reason, idempotencyKey) lands on the
 *      ticket — that's what the resolver needs to find the partial
 *      state.
 *   3. A plain saga forward error (no compensation failure) does NOT
 *      enqueue a ticket — the system self-healed via compensation.
 *   4. If the reporter itself throws (Mongo down, schema drift), the
 *      saga error is STILL re-thrown (just without ticket info) — the
 *      reporter must never replace the user-visible failure.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const request = require('supertest') as typeof import('supertest').default;
import type { Request, Response, NextFunction, RequestHandler } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const express = require('express') as typeof import('express').default;

import type { IPaymentProvider } from '@nugen/payment-gateway';
import type { CreditServiceResult } from '../../src/modules/credit/credit.service';
import type { PromoCodeServiceResult } from '../../src/modules/promo-code/promoCode.service';
import {
  setReconciliationReporter,
  type ReconciliationReporter,
  type SagaCompensationError,
} from '../../src/lib/saga';

// ── Mock @nugen/payment-gateway ───────────────────────────────────────────

const processRefundMock = jest.fn();

jest.mock('@nugen/payment-gateway', () => {
  const actual = jest.requireActual('@nugen/payment-gateway');
  return {
    ...actual,
    processRefund: (...args: unknown[]) => processRefundMock(...args),
  };
});

const auditLogMock = jest.fn().mockResolvedValue(undefined);
jest.mock('@nugen/audit-log', () => ({
  log: (...args: unknown[]) => auditLogMock(...args),
  logFromRequest: jest.fn(),
}));

// Import AFTER mocks so the route picks up mocked processRefund.
// eslint-disable-next-line import/order
import { createRefundRoutes } from '../../src/modules/order-management/refund.routes';

// ── Constants ──────────────────────────────────────────────────────────────

const ACTOR_ID = '670000000000000000000001';
const CLIENT_ID = '670000000000000000000010';
const ORDER_ID = '670000000000000000000020';
const PAYMENT_ID = '670000000000000000000030';
const TOTAL = 30000;
const CREDIT_APPLIED = 10000;
const DISCOUNT = 5000;
const PROMO_CODE = 'SAVE50';

// ── In-memory order ────────────────────────────────────────────────────────

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
  return {
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
      /* re-bound per test */
    },
    ...overrides,
  };
}

function buildOrderModel(order: StoredOrder): unknown {
  return {
    findById: async (id: string): Promise<StoredOrder | null> =>
      id === order._id && !order.isDeleted ? order : null,
  };
}

function buildPaymentModel(): unknown {
  return {
    findById: (id: string) => ({
      lean: async (): Promise<Record<string, unknown> | null> =>
        id === PAYMENT_ID
          ? {
              _id: PAYMENT_ID,
              orderId: ORDER_ID,
              userId: CLIENT_ID,
              status: 'succeeded',
              amount: TOTAL,
            }
          : null,
    }),
  };
}

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

// ── In-memory reconciliation queue ─────────────────────────────────────────
// We don't need the full Mongoose model here — just a stand-in that
// records what was enqueued. The saga module's reporter hook is the only
// integration point we care about; the model behaviour is tested
// elsewhere (unit-level when worth it).

interface EnqueuedTicket {
  ticketNumber: string;
  ticketId: string;
  sagaName: string;
  originalErrorMessage: string;
  compensationFailures: Array<{ step: string; message: string }>;
  metadata: Record<string, unknown>;
}

function buildInMemoryReporter(opts: { failEnqueue?: boolean; ticketCounter?: { n: number } }): {
  reporter: ReconciliationReporter;
  enqueued: EnqueuedTicket[];
} {
  const enqueued: EnqueuedTicket[] = [];
  const counter = opts.ticketCounter ?? { n: 0 };

  const reporter: ReconciliationReporter = async (
    error: SagaCompensationError,
    metadata?: Record<string, unknown>,
  ) => {
    if (opts.failEnqueue) {
      throw new Error('reconciliation enqueue exploded');
    }
    counter.n += 1;
    const ticketNumber = `QGS-RC-${String(counter.n).padStart(4, '0')}`;
    const ticketId = `mock_ticket_id_${counter.n}`;
    enqueued.push({
      ticketNumber,
      ticketId,
      sagaName: error.sagaName,
      originalErrorMessage: error.originalError.message,
      compensationFailures: error.compensationFailures.map((f) => ({
        step: f.step,
        message: f.error.message,
      })),
      metadata: metadata ?? {},
    });
    return { ticketId, ticketNumber };
  };

  return { reporter, enqueued };
}

// ── Stub services ──────────────────────────────────────────────────────────

interface CreditCallLog {
  refundCalls: Array<{ userId: string; amount: number; type: string; description: string }>;
  useCalls: Array<{ userId: string; amount: number; orderId: string }>;
}

function buildCreditService(opts: {
  log: CreditCallLog;
  failUseCredit?: boolean;
}): CreditServiceResult {
  return {
    getBalance: async () => 0,
    addCredit: (async (userId: string, amount: number, type: string, description: string) => {
      opts.log.refundCalls.push({ userId, amount, type, description });
      return { _id: 'credit_refund_id' } as never;
    }) as CreditServiceResult['addCredit'],
    useCredit: (async (userId: string, amount: number, orderId: string) => {
      opts.log.useCalls.push({ userId, amount, orderId });
      if (opts.failUseCredit) {
        throw new Error('useCredit compensation failed');
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

function mountRoute(opts: {
  order: StoredOrder;
  failUseCredit?: boolean;
  failRevoke?: boolean;
  failOrderSave?: boolean;
}): {
  app: express.Express;
  creditLog: CreditCallLog;
  promoLog: PromoCallLog;
  order: StoredOrder;
} {
  const creditLog: CreditCallLog = { refundCalls: [], useCalls: [] };
  const promoLog: PromoCallLog = { applyCalls: [], revokeCalls: [] };

  if (opts.failOrderSave) {
    let firstCall = true;
    opts.order.save = async (): Promise<void> => {
      if (firstCall) {
        firstCall = false;
        throw new Error('order.save failed');
      }
    };
  }

  const authenticate = (): RequestHandler => {
    return (req: Request, _res: Response, next: NextFunction): void => {
      (req as unknown as Record<string, unknown>).user = {
        userId: ACTOR_ID,
        _id: ACTOR_ID,
        userType: 0,
      };
      next();
    };
  };
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
      failUseCredit: opts.failUseCredit,
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

function defaultProcessRefundResult(): Record<string, unknown> {
  return {
    refundEntry: { refundId: 'rf_test_01', amount: TOTAL, status: 'succeeded' },
    payment: {
      _id: PAYMENT_ID,
      paymentNumber: 'QGS-P-0001',
      userId: CLIENT_ID,
      orderId: ORDER_ID,
      status: 'refunded',
      refundedAmount: TOTAL,
    },
    requiredApproval: 'super_admin',
  };
}

describe('E2E: SagaCompensationError → reconciliation queue surfacing', () => {
  beforeEach(() => {
    processRefundMock.mockReset();
    auditLogMock.mockClear();
  });

  afterEach(() => {
    setReconciliationReporter(null);
  });

  it('SagaCompensationError → reporter invoked, ticket fields surfaced in response', async () => {
    processRefundMock.mockResolvedValue(defaultProcessRefundResult());
    const { reporter, enqueued } = buildInMemoryReporter({});
    setReconciliationReporter(reporter);

    // failOrderSave + failUseCredit: order.save throws AFTER credit + promo
    // ran. Compensations run in reverse: promo re-applied (succeeds), then
    // credit useCredit (FAILS) → SagaCompensationError.
    const order = makeOrder();
    const { app } = mountRoute({ order, failOrderSave: true, failUseCredit: true });

    const res = await request(app).post(`/api/admin/payments/${PAYMENT_ID}/full-refund`).send({
      reason: 'Test reconciliation surfacing',
      idempotencyKey: 'idem_recon_001',
    });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('SAGA_COMPENSATION_FAILED');
    expect(res.body.manualReconciliationRequired).toBe(true);
    expect(res.body.ticketNumber).toBe('QGS-RC-0001');
    expect(res.body.ticketId).toBe('mock_ticket_id_1');
    expect(res.body.message).toContain('refund.domainSync');

    // Reporter was invoked exactly once with the right shape.
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].sagaName).toBe('refund.domainSync');
    expect(enqueued[0].originalErrorMessage).toBe('order.save failed');
    expect(enqueued[0].compensationFailures).toHaveLength(1);
    expect(enqueued[0].compensationFailures[0].step).toBe('reCreditUser');
    expect(enqueued[0].compensationFailures[0].message).toBe('useCredit compensation failed');
  });

  it('saga metadata breadcrumbs land on the ticket', async () => {
    processRefundMock.mockResolvedValue(defaultProcessRefundResult());
    const { reporter, enqueued } = buildInMemoryReporter({});
    setReconciliationReporter(reporter);

    const order = makeOrder();
    const { app } = mountRoute({ order, failOrderSave: true, failUseCredit: true });

    await request(app).post(`/api/admin/payments/${PAYMENT_ID}/full-refund`).send({
      reason: 'Customer requested cancellation',
      idempotencyKey: 'idem_meta_002',
    });

    expect(enqueued).toHaveLength(1);
    const meta = enqueued[0].metadata;
    expect(meta.paymentId).toBe(PAYMENT_ID);
    expect(meta.paymentNumber).toBe('QGS-P-0001');
    expect(meta.orderId).toBe(ORDER_ID);
    expect(meta.orderNumber).toBe('QGS-O-0001');
    expect(meta.userId).toBe(CLIENT_ID);
    expect(meta.refundAmount).toBe(TOTAL);
    expect(meta.isFullRefund).toBe(true);
    expect(meta.actorId).toBe(ACTOR_ID);
    expect(meta.reason).toBe('Customer requested cancellation');
    expect(meta.idempotencyKey).toBe('idem_meta_002');
  });

  it('plain saga forward error (compensations all OK) does NOT enqueue a ticket', async () => {
    processRefundMock.mockResolvedValue(defaultProcessRefundResult());
    const { reporter, enqueued } = buildInMemoryReporter({});
    setReconciliationReporter(reporter);

    // failOrderSave WITHOUT failUseCredit: order.save throws but BOTH
    // compensations succeed. Saga re-throws the original forward error,
    // not SagaCompensationError. Reporter must NOT be called.
    const order = makeOrder();
    const { app } = mountRoute({ order, failOrderSave: true });

    const res = await request(app).post(`/api/admin/payments/${PAYMENT_ID}/full-refund`).send({
      reason: 'Test self-heal',
      idempotencyKey: 'idem_selfheal_003',
    });

    expect(res.status).toBe(500);
    // Plain Error (not SagaCompensationError) — no SAGA_COMPENSATION_FAILED code.
    expect(res.body.code).toBeUndefined();
    expect(res.body.message).toContain('order.save failed');
    expect(res.body.ticketNumber).toBeUndefined();

    // Reporter NEVER called — system self-healed via compensation.
    expect(enqueued).toHaveLength(0);
  });

  it('reporter throws → saga error STILL re-thrown (without ticket info)', async () => {
    processRefundMock.mockResolvedValue(defaultProcessRefundResult());
    const { reporter, enqueued } = buildInMemoryReporter({ failEnqueue: true });
    setReconciliationReporter(reporter);

    const order = makeOrder();
    const { app } = mountRoute({ order, failOrderSave: true, failUseCredit: true });

    const res = await request(app).post(`/api/admin/payments/${PAYMENT_ID}/full-refund`).send({
      reason: 'Test reporter robustness',
      idempotencyKey: 'idem_reporter_fail_004',
    });

    // The SagaCompensationError still surfaces with code, but ticketNumber
    // is undefined (reporter blew up before populating it).
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('SAGA_COMPENSATION_FAILED');
    expect(res.body.manualReconciliationRequired).toBe(true);
    expect(res.body.ticketNumber).toBeUndefined();
    expect(res.body.ticketId).toBeUndefined();
    expect(res.body.message).toContain('refund.domainSync');

    // Reporter was called (and threw) — enqueued list stays empty.
    expect(enqueued).toHaveLength(0);
  });

  it('audit log includes ticket number when reporter populates it', async () => {
    processRefundMock.mockResolvedValue(defaultProcessRefundResult());
    const { reporter } = buildInMemoryReporter({});
    setReconciliationReporter(reporter);

    const order = makeOrder();
    const { app } = mountRoute({ order, failOrderSave: true, failUseCredit: true });

    await request(app).post(`/api/admin/payments/${PAYMENT_ID}/full-refund`).send({
      reason: 'Audit ticket number test',
      idempotencyKey: 'idem_audit_ticket_005',
    });

    const failureLog = auditLogMock.mock.calls.find(
      (call) =>
        typeof call[0] === 'object' &&
        call[0] !== null &&
        (call[0] as { description?: string }).description?.includes(
          'MANUAL RECONCILIATION REQUIRED',
        ),
    );
    expect(failureLog).toBeDefined();
    expect((failureLog![0] as { severity: string }).severity).toBe('critical');
    expect((failureLog![0] as { description: string }).description).toContain('ticket QGS-RC-0001');
  });
});
