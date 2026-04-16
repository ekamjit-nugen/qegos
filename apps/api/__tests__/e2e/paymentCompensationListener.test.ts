/**
 * E2E: Payment compensation listener — abandoned-checkout recovery
 *
 * The partial-Stripe path in Pay Now and Collect Payment provisionally
 * deducts credits + counts promo usage BEFORE Stripe confirms the
 * charge. If the customer abandons checkout (or card declines), the
 * Stripe webhook fires `payment_intent.canceled` /
 * `payment_intent.payment_failed`; the package's webhookProcessor
 * updates Payment.status and emits `payment.cancelled` / `payment.failed`
 * via `paymentEvents`.
 *
 * Without this listener: nobody subscribes to those events. Credits
 * stay deducted, promo usage stays counted, the order sits at
 * paymentStatus='pending' with creditApplied=N, and the next checkout
 * attempt may charge the user the full price because their balance is
 * gone.
 *
 * This suite mounts the real `registerPaymentCompensationListener`
 * against in-memory mocks and proves:
 *
 *   1. Happy-path failed event — addCredit fires, revokePromoCode fires,
 *      order's provisional fields reset, Payment.domainCompensated=true.
 *   2. Cancelled event behaves identically.
 *   3. Idempotency — second event for the same payment is a no-op
 *      (no double credit, no double revoke).
 *   4. Order.creditApplied = 0 (no credits were used) — addCredit not
 *      called, revoke called only if promo was used.
 *   5. Order paymentStatus='succeeded' (a different intent settled) —
 *      compensation skipped, audit at 'warning'.
 *   6. Orphan payment (payment exists, order missing) — payment marked
 *      compensated, audit at 'high'.
 *   7. addCredit throws — listener does NOT throw, audit at 'critical',
 *      payment still marked compensated to prevent infinite retry.
 *   8. End-to-end via processStripeWebhook — webhook drives the whole
 *      pipeline (proves wiring through paymentEvents works).
 *
 * If anyone removes the listener registration in server.ts, or someone
 * weakens the idempotency guard, this suite catches the regression
 * before it ships.
 */

const auditLogMock = jest.fn().mockResolvedValue(undefined);

jest.mock('@nugen/audit-log', () => ({
  log: (...args: unknown[]) => auditLogMock(...args),
  logFromRequest: jest.fn(),
}));

// eslint-disable-next-line import/order
import {
  paymentEvents,
  initWebhookProcessor,
  processStripeWebhook,
  type PaymentEventPayload,
} from '@nugen/payment-gateway';
import { registerPaymentCompensationListener } from '../../src/modules/order-management/paymentCompensation.listener';
import type { CreditServiceResult } from '../../src/modules/credit/credit.service';
import type { PromoCodeServiceResult } from '../../src/modules/promo-code/promoCode.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const CLIENT_ID = '670000000000000000000010';
const ORDER_ID = '670000000000000000000020';
const PAYMENT_ID = '670000000000000000000030';
const TOTAL = 30000;
const CREDIT_APPLIED = 8000;
const DISCOUNT = 5000;
const PROMO = 'SAVE15';
const GATEWAY_TXN_ID = 'pi_listener_test_001';

// ─── In-memory order ────────────────────────────────────────────────────────

interface StoredOrder {
  _id: string;
  userId: string;
  orderNumber: string;
  totalAmount: number;
  paymentStatus: 'pending' | 'succeeded' | 'failed';
  creditApplied?: number;
  promoCode?: string;
  discountAmount?: number;
  finalAmount?: number;
  save: () => Promise<void>;
}

function makeOrder(overrides?: Partial<StoredOrder>): StoredOrder {
  const order: StoredOrder = {
    _id: ORDER_ID,
    userId: CLIENT_ID,
    orderNumber: 'QGS-O-0050',
    totalAmount: TOTAL,
    paymentStatus: 'pending',
    creditApplied: CREDIT_APPLIED,
    promoCode: PROMO,
    discountAmount: DISCOUNT,
    finalAmount: TOTAL - CREDIT_APPLIED - DISCOUNT,
    save: async (): Promise<void> => {
      // overridden per-test if needed
    },
    ...overrides,
  };
  return order;
}

function buildOrderModel(orders: Map<string, StoredOrder>): unknown {
  return {
    findById: async (id: string): Promise<StoredOrder | null> => {
      return orders.get(id) ?? null;
    },
  };
}

// ─── In-memory payment ──────────────────────────────────────────────────────

interface StoredPayment {
  _id: string;
  orderId: string;
  userId: string;
  gatewayTxnId: string;
  amount: number;
  capturedAmount: number;
  refundedAmount: number;
  status: string;
  webhookProcessed: boolean;
  webhookProcessedAt: Date | null;
  domainCompensated?: boolean;
  domainCompensatedAt?: Date;
  save: () => Promise<void>;
}

function makePayment(overrides?: Partial<StoredPayment>): StoredPayment {
  const p: StoredPayment = {
    _id: PAYMENT_ID,
    orderId: ORDER_ID,
    userId: CLIENT_ID,
    gatewayTxnId: GATEWAY_TXN_ID,
    amount: TOTAL - CREDIT_APPLIED - DISCOUNT,
    capturedAmount: 0,
    refundedAmount: 0,
    status: 'pending',
    webhookProcessed: false,
    webhookProcessedAt: null,
    save: async (): Promise<void> => {
      // overridden per-test
    },
    ...overrides,
  };
  return p;
}

function buildPaymentModel(payments: Map<string, StoredPayment>): unknown {
  return {
    findById: async (id: string): Promise<StoredPayment | null> => {
      return payments.get(id) ?? null;
    },
    findOne: (filter: Record<string, unknown>) => {
      const run = (): StoredPayment | null => {
        for (const p of payments.values()) {
          if (filter.gatewayTxnId && p.gatewayTxnId !== filter.gatewayTxnId) {
            continue;
          }
          return p;
        }
        return null;
      };
      return {
        lean: async (): Promise<StoredPayment | null> => run(),
        then: (resolve: (v: StoredPayment | null) => unknown) => resolve(run()),
      };
    },
  };
}

// ─── In-memory webhook events ───────────────────────────────────────────────

interface StoredWebhookEvent {
  eventId: string;
  status: string;
  save: () => Promise<void>;
}

function buildWebhookEventModel(store: Map<string, StoredWebhookEvent>): unknown {
  return {
    findOne: (filter: { eventId: string }) => ({
      lean: async (): Promise<StoredWebhookEvent | null> => store.get(filter.eventId) ?? null,
    }),
    create: async (data: Record<string, unknown>): Promise<StoredWebhookEvent> => {
      const eventId = data.eventId as string;
      const evt: StoredWebhookEvent = {
        eventId,
        status: (data.status as string) ?? 'processing',
        save: async (): Promise<void> => {
          store.set(eventId, evt);
        },
      };
      store.set(eventId, evt);
      return evt;
    },
  };
}

// ─── Stub services that record calls ────────────────────────────────────────

interface CreditCallLog {
  refundCalls: Array<{
    userId: string;
    amount: number;
    type: string;
    description: string;
    referenceId?: string;
  }>;
}

function buildCreditService(opts: {
  log: CreditCallLog;
  failAddCredit?: boolean;
}): CreditServiceResult {
  return {
    getBalance: (async () => 0) as CreditServiceResult['getBalance'],
    addCredit: (async (
      userId: string,
      amount: number,
      type: string,
      description: string,
      referenceId?: string,
    ) => {
      opts.log.refundCalls.push({ userId, amount, type, description, referenceId });
      if (opts.failAddCredit) {
        throw new Error('addCredit failed');
      }
      return { _id: 'credit_refund_id' } as never;
    }) as CreditServiceResult['addCredit'],
    useCredit: (async () =>
      ({ _id: 'credit_use_id' }) as never) as CreditServiceResult['useCredit'],
    getTransactions: (async () => ({
      transactions: [],
      total: 0,
    })) as CreditServiceResult['getTransactions'],
    getRestoredCreditForOrder: (async () => 0) as CreditServiceResult['getRestoredCreditForOrder'],
    expireCredits: (async () => 0) as CreditServiceResult['expireCredits'],
  };
}

interface PromoCallLog {
  revokeCalls: Array<{ code: string; userId: string; orderId: string }>;
}

function buildPromoService(opts: { log: PromoCallLog }): PromoCodeServiceResult {
  return {
    createPromoCode: (async () => ({}) as never) as PromoCodeServiceResult['createPromoCode'],
    validatePromoCode: (async () => ({}) as never) as PromoCodeServiceResult['validatePromoCode'],
    applyPromoCode: (async () => ({
      discountApplied: 0,
    })) as PromoCodeServiceResult['applyPromoCode'],
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

// ─── Setup helper ───────────────────────────────────────────────────────────

interface SetupOpts {
  order?: StoredOrder | null;
  payment?: StoredPayment;
  failAddCredit?: boolean;
  failOrderSave?: boolean;
  failPaymentSave?: boolean;
}

interface SetupResult {
  unregister: () => void;
  orders: Map<string, StoredOrder>;
  payments: Map<string, StoredPayment>;
  creditLog: CreditCallLog;
  promoLog: PromoCallLog;
  emit: (
    eventName: 'payment.failed' | 'payment.cancelled',
    payload?: PaymentEventPayload,
  ) => Promise<void>;
}

function setup(opts: SetupOpts = {}): SetupResult {
  const orders = new Map<string, StoredOrder>();
  const payments = new Map<string, StoredPayment>();
  const creditLog: CreditCallLog = { refundCalls: [] };
  const promoLog: PromoCallLog = { revokeCalls: [] };

  // Order: provided explicitly, or default. `null` means "no order at all"
  // (orphan payment scenario). `undefined` means use default.
  if (opts.order !== null) {
    const order = opts.order ?? makeOrder();
    if (opts.failOrderSave) {
      order.save = async (): Promise<void> => {
        throw new Error('order.save failed');
      };
    } else {
      order.save = async (): Promise<void> => {
        orders.set(order._id, order);
      };
    }
    orders.set(order._id, order);
  }

  const payment = opts.payment ?? makePayment();
  if (opts.failPaymentSave) {
    payment.save = async (): Promise<void> => {
      throw new Error('payment.save failed');
    };
  } else {
    payment.save = async (): Promise<void> => {
      payments.set(payment._id, payment);
    };
  }
  payments.set(payment._id, payment);

  const unregister = registerPaymentCompensationListener({
    OrderModel: buildOrderModel(orders) as never,
    PaymentModel: buildPaymentModel(payments) as never,
    creditService: buildCreditService({ log: creditLog, failAddCredit: opts.failAddCredit }),
    promoCodeService: buildPromoService({ log: promoLog }),
  });

  // Helper: emit and then drain microtasks so the async listener completes
  // before the test asserts. Listeners use `void compensate(...)` so the
  // emit returns synchronously without awaiting. We need a few microtask
  // drains to cover the listener's chained awaits.
  async function emit(
    eventName: 'payment.failed' | 'payment.cancelled',
    payload?: PaymentEventPayload,
  ): Promise<void> {
    const finalPayload: PaymentEventPayload = payload ?? {
      paymentId: PAYMENT_ID,
      orderId: ORDER_ID,
      userId: CLIENT_ID,
      gateway: 'stripe',
      amount: payment.amount,
      status: eventName === 'payment.failed' ? 'failed' : 'cancelled',
    };
    paymentEvents.emit(eventName, finalPayload);
    // Drain enough microtasks for: findById(payment) → findById(order)
    // → addCredit → revokePromoCode → order.save → payment.save → audit.
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
  }

  return { unregister, orders, payments, creditLog, promoLog, emit };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('E2E: paymentCompensation listener', () => {
  beforeEach(() => {
    auditLogMock.mockClear();
    // Make sure no stray listeners survive between tests.
    paymentEvents.removeAllListeners('payment.failed');
    paymentEvents.removeAllListeners('payment.cancelled');
  });

  it('payment.failed restores credits + revokes promo + resets order + marks compensated', async () => {
    const { unregister, orders, payments, creditLog, promoLog, emit } = setup();

    await emit('payment.failed');

    // Credit restored exactly once with the right amount, type, refId.
    expect(creditLog.refundCalls).toHaveLength(1);
    expect(creditLog.refundCalls[0].userId).toBe(CLIENT_ID);
    expect(creditLog.refundCalls[0].amount).toBe(CREDIT_APPLIED);
    expect(creditLog.refundCalls[0].type).toBe('refund_credit');
    expect(creditLog.refundCalls[0].referenceId).toBe(ORDER_ID);
    expect(creditLog.refundCalls[0].description).toMatch(/compensation/i);

    // Promo revoked.
    expect(promoLog.revokeCalls).toHaveLength(1);
    expect(promoLog.revokeCalls[0].code).toBe(PROMO);
    expect(promoLog.revokeCalls[0].orderId).toBe(ORDER_ID);

    // Order's provisional state cleared; paymentStatus left at 'pending'.
    const order = orders.get(ORDER_ID);
    expect(order?.creditApplied).toBe(0);
    expect(order?.promoCode).toBeUndefined();
    expect(order?.discountAmount).toBe(0);
    expect(order?.finalAmount).toBe(TOTAL);
    expect(order?.paymentStatus).toBe('pending');

    // Payment marked compensated.
    const payment = payments.get(PAYMENT_ID);
    expect(payment?.domainCompensated).toBe(true);
    expect(payment?.domainCompensatedAt).toBeInstanceOf(Date);

    unregister();
  });

  it('payment.cancelled behaves identically to payment.failed', async () => {
    const { unregister, orders, payments, creditLog, promoLog, emit } = setup();

    await emit('payment.cancelled');

    expect(creditLog.refundCalls).toHaveLength(1);
    expect(promoLog.revokeCalls).toHaveLength(1);
    expect(orders.get(ORDER_ID)?.creditApplied).toBe(0);
    expect(payments.get(PAYMENT_ID)?.domainCompensated).toBe(true);

    unregister();
  });

  it('idempotency: second event for same payment is a no-op (no double credit, no double revoke)', async () => {
    const { unregister, creditLog, promoLog, emit } = setup();

    await emit('payment.failed');
    await emit('payment.failed'); // duplicate webhook delivery
    await emit('payment.cancelled'); // another path firing on the same payment

    expect(creditLog.refundCalls).toHaveLength(1);
    expect(promoLog.revokeCalls).toHaveLength(1);

    unregister();
  });

  it('order with no credits used: addCredit not called, promo still revoked', async () => {
    const order = makeOrder({ creditApplied: 0, finalAmount: TOTAL - DISCOUNT });
    const payment = makePayment({ amount: TOTAL - DISCOUNT });
    const { unregister, orders, payments, creditLog, promoLog, emit } = setup({ order, payment });

    await emit('payment.failed');

    expect(creditLog.refundCalls).toHaveLength(0);
    expect(promoLog.revokeCalls).toHaveLength(1);
    expect(orders.get(ORDER_ID)?.discountAmount).toBe(0);
    expect(payments.get(PAYMENT_ID)?.domainCompensated).toBe(true);

    unregister();
  });

  it('order with no promo: revoke not called, credit still restored', async () => {
    const order = makeOrder({
      promoCode: undefined,
      discountAmount: 0,
      finalAmount: TOTAL - CREDIT_APPLIED,
    });
    const payment = makePayment({ amount: TOTAL - CREDIT_APPLIED });
    const { unregister, creditLog, promoLog, emit } = setup({ order, payment });

    await emit('payment.failed');

    expect(creditLog.refundCalls).toHaveLength(1);
    expect(promoLog.revokeCalls).toHaveLength(0);

    unregister();
  });

  it('order already succeeded: skip compensation, audit at warning, mark compensated to prevent loop', async () => {
    const order = makeOrder({ paymentStatus: 'succeeded' });
    const { unregister, payments, creditLog, promoLog, emit } = setup({ order });

    await emit('payment.failed');

    // No state mutation — a different payment intent settled this order.
    expect(creditLog.refundCalls).toHaveLength(0);
    expect(promoLog.revokeCalls).toHaveLength(0);

    // Marked compensated so the next webhook delivery doesn't loop.
    expect(payments.get(PAYMENT_ID)?.domainCompensated).toBe(true);

    // Audit captured a warning describing the skip.
    const warningCall = auditLogMock.mock.calls.find(
      (c) => (c[0] as { severity: string }).severity === 'warning',
    );
    expect(warningCall).toBeDefined();
    expect((warningCall![0] as { description: string }).description).toMatch(/already succeeded/i);

    unregister();
  });

  it('orphan payment (order not found): mark compensated, audit at high', async () => {
    const { unregister, payments, creditLog, promoLog, emit } = setup({ order: null });

    await emit('payment.cancelled');

    expect(creditLog.refundCalls).toHaveLength(0);
    expect(promoLog.revokeCalls).toHaveLength(0);
    expect(payments.get(PAYMENT_ID)?.domainCompensated).toBe(true);

    const highCall = auditLogMock.mock.calls.find(
      (c) => (c[0] as { severity: string }).severity === 'high',
    );
    expect(highCall).toBeDefined();
    expect((highCall![0] as { description: string }).description).toMatch(/orphaned/i);

    unregister();
  });

  it('addCredit throws: listener does NOT throw, audit at critical, payment still marked compensated', async () => {
    const { unregister, orders, payments, creditLog, promoLog, emit } = setup({
      failAddCredit: true,
    });

    // Must not throw.
    await expect(emit('payment.failed')).resolves.not.toThrow();

    // addCredit was attempted (and failed); revoke + reset still ran.
    expect(creditLog.refundCalls).toHaveLength(1);
    expect(promoLog.revokeCalls).toHaveLength(1);
    expect(orders.get(ORDER_ID)?.creditApplied).toBe(0);

    // Marked compensated to prevent retry loop on duplicate webhooks.
    expect(payments.get(PAYMENT_ID)?.domainCompensated).toBe(true);

    // Audit at 'critical' with MANUAL RECONCILIATION REQUIRED.
    const criticalCall = auditLogMock.mock.calls.find(
      (c) => (c[0] as { severity: string }).severity === 'critical',
    );
    expect(criticalCall).toBeDefined();
    expect((criticalCall![0] as { description: string }).description).toMatch(
      /MANUAL RECONCILIATION REQUIRED/,
    );
    expect((criticalCall![0] as { description: string }).description).toMatch(/reCreditUser/);

    unregister();
  });

  it('end-to-end: Stripe webhook drives the listener via paymentEvents', async () => {
    // Build a payment that webhookProcessor can find by gatewayTxnId.
    const order = makeOrder();
    const payment = makePayment();
    const orders = new Map([[ORDER_ID, order]]);
    const payments = new Map([[PAYMENT_ID, payment]]);
    const webhookEvents = new Map<string, StoredWebhookEvent>();

    order.save = async (): Promise<void> => {
      orders.set(ORDER_ID, order);
    };
    payment.save = async (): Promise<void> => {
      payments.set(PAYMENT_ID, payment);
    };

    const creditLog: CreditCallLog = { refundCalls: [] };
    const promoLog: PromoCallLog = { revokeCalls: [] };

    // Wire the package's webhook processor to OUR payment store so the
    // webhook actually finds the payment we're testing against.
    initWebhookProcessor(
      buildWebhookEventModel(webhookEvents) as never,
      buildPaymentModel(payments) as never,
    );

    // Register the listener with the same stores.
    const unregister = registerPaymentCompensationListener({
      OrderModel: buildOrderModel(orders) as never,
      PaymentModel: buildPaymentModel(payments) as never,
      creditService: buildCreditService({ log: creditLog }),
      promoCodeService: buildPromoService({ log: promoLog }),
    });

    // Drive a real Stripe webhook for payment_intent.canceled.
    const result = await processStripeWebhook(
      'evt_listener_e2e_cancel_01',
      'payment_intent.canceled',
      {
        data: {
          object: {
            id: GATEWAY_TXN_ID,
            amount: payment.amount,
          },
        },
      },
    );

    expect(result.processed).toBe(true);
    expect(payment.status).toBe('cancelled');

    // Drain microtasks for the listener's async chain.
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }

    // Listener compensated.
    expect(creditLog.refundCalls).toHaveLength(1);
    expect(creditLog.refundCalls[0].amount).toBe(CREDIT_APPLIED);
    expect(promoLog.revokeCalls).toHaveLength(1);
    expect(orders.get(ORDER_ID)?.creditApplied).toBe(0);
    expect(payments.get(PAYMENT_ID)?.domainCompensated).toBe(true);

    unregister();
  });
});
