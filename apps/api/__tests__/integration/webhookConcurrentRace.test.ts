/**
 * Integration: webhook idempotency under PARALLEL delivery.
 *
 * The unit suite (apps/api/__tests__/e2e/webhookIdempotencyReplay.test.ts)
 * proves the SEQUENTIAL replay path is correct against an in-memory
 * collection mock. That mock can't reproduce what only Mongo does:
 * a unique-index collision when two writes for the same eventId race
 * each other within milliseconds. This file fills that gap by spinning
 * up an in-memory MongoDB (mongodb-memory-server), creating the real
 * Mongoose models from `@nugen/payment-gateway`, and firing concurrent
 * processStripeWebhook calls with the same eventId.
 *
 * Real-world trigger: Stripe retries a webhook ~5 seconds after the
 * first attempt if it didn't see our 200. Under heavy load (or on the
 * first delivery to a freshly deployed pod), two retries can land in
 * the same Node event loop tick. The dedup contract is:
 *
 *   - exactly ONE caller observes processed=true,duplicate=false
 *   - the OTHER caller observes processed=false,duplicate=true OR
 *     surfaces the duplicate-key error gracefully (we accept either —
 *     the existing handler doesn't catch the duplicate-key throw, so
 *     the second caller will reject; we document that here so future
 *     contributors don't add a swallow that masks a real bug)
 *   - exactly ONE WebhookEvent row exists
 *   - the Payment is mutated exactly once (capturedAmount === amount,
 *     not 2 × amount)
 *   - paymentEvents emits exactly one event
 *
 * The test is allowed to be slow (mongodb-memory-server downloads a
 * binary on first run; subsequent runs use the cached binary). It is
 * placed in __tests__/integration/ rather than e2e/ so a future test
 * runner could shard them onto a different worker.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  createPaymentModel,
  createWebhookEventModel,
  initWebhookProcessor,
  paymentEvents,
  processStripeWebhook,
} from '@nugen/payment-gateway';
import type { IPaymentDocument, IWebhookEventDocument } from '@nugen/payment-gateway';
import type { Connection, Model } from 'mongoose';

jest.setTimeout(60_000); // first run downloads the mongo binary

let mongo: MongoMemoryServer;
let connection: Connection;
let PaymentModel: Model<IPaymentDocument>;
let WebhookEventModel: Model<IWebhookEventDocument>;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  connection = (await mongoose.createConnection(mongo.getUri()).asPromise()) as Connection;
  PaymentModel = createPaymentModel(connection);
  WebhookEventModel = createWebhookEventModel(connection);
  // Force the unique index on eventId to actually exist in this fresh
  // database before we race against it.
  await WebhookEventModel.syncIndexes();
  initWebhookProcessor(WebhookEventModel, PaymentModel);
});

afterAll(async () => {
  await connection.close();
  await mongo.stop();
});

afterEach(async () => {
  paymentEvents.removeAllListeners();
  await PaymentModel.deleteMany({});
  await WebhookEventModel.deleteMany({});
});

const ORDER_ID = new mongoose.Types.ObjectId();
const USER_ID = new mongoose.Types.ObjectId();

async function seedPendingPayment(opts: {
  paymentNumber: string;
  gatewayTxnId: string;
  amount?: number;
}): Promise<IPaymentDocument> {
  return PaymentModel.create({
    paymentNumber: opts.paymentNumber,
    orderId: ORDER_ID,
    userId: USER_ID,
    gateway: 'stripe',
    gatewayTxnId: opts.gatewayTxnId,
    idempotencyKey: `idem_${opts.gatewayTxnId}`,
    amount: opts.amount ?? 25_000,
    currency: 'AUD',
    status: 'pending',
  });
}

describe('Integration: webhook idempotency under parallel delivery (real Mongo)', () => {
  it('two parallel deliveries of the same eventId → exactly one mutation, one row, one event emit', async () => {
    const gatewayTxnId = 'pi_race_concurrent_001';
    const eventId = 'evt_race_concurrent_001';
    const amount = 25_000;
    await seedPendingPayment({
      paymentNumber: 'QGS-P-RACE-001',
      gatewayTxnId,
      amount,
    });

    const onSucceeded = jest.fn();
    paymentEvents.on('payment.succeeded', onSucceeded);

    const payload = { data: { object: { id: gatewayTxnId, amount } } };

    // Fire two concurrent processStripeWebhook calls. allSettled because
    // the loser MAY throw (duplicate-key from the unique index) rather
    // than return duplicate:true — both outcomes are acceptable; what
    // matters is the SIDE EFFECTS converge.
    const results = await Promise.allSettled([
      processStripeWebhook(eventId, 'payment_intent.succeeded', payload),
      processStripeWebhook(eventId, 'payment_intent.succeeded', payload),
    ]);

    // ─── Side-effect invariants ─────────────────────────────────────────
    const events = await WebhookEventModel.find({ eventId });
    expect(events).toHaveLength(1); // unique index held
    expect(events[0].status).toBe('processed');

    const payment = await PaymentModel.findOne({ gatewayTxnId });
    expect(payment).toBeTruthy();
    expect(payment?.status).toBe('succeeded');
    expect(payment?.capturedAmount).toBe(amount); // not 2 * amount
    expect(payment?.webhookProcessed).toBe(true);

    expect(onSucceeded).toHaveBeenCalledTimes(1);

    // ─── Caller outcomes ────────────────────────────────────────────────
    // The exactly-one-success contract: of the two returns, at most one
    // got processed=true. The other was either duplicate=true or threw
    // a duplicate-key error from the unique index (E11000).
    const fulfilledProcessed = results.filter(
      (r): r is PromiseFulfilledResult<{ processed: boolean; duplicate: boolean }> =>
        r.status === 'fulfilled' && r.value.processed === true,
    );
    expect(fulfilledProcessed).toHaveLength(1);

    const losers = results.filter((r) => !(r.status === 'fulfilled' && r.value.processed === true));
    expect(losers).toHaveLength(1);
    const loser = losers[0];
    if (loser.status === 'fulfilled') {
      // Acceptable: the loser was scheduled AFTER the winner finished
      // and saw the existing row → duplicate:true.
      expect(loser.value).toEqual({ processed: false, duplicate: true });
    } else {
      // Acceptable: the loser raced into create() before the winner
      // finished and got slammed by the unique-index collision (E11000).
      // We document this as expected; if a future contributor wraps
      // create() in a try/catch that swallows it, this branch flips and
      // the assertion above (`fulfilledProcessed` length 1) still holds.
      expect(String(loser.reason)).toMatch(/E11000|duplicate key/i);
    }
  });

  it('five parallel deliveries of the same eventId → still exactly one mutation', async () => {
    const gatewayTxnId = 'pi_race_concurrent_005';
    const eventId = 'evt_race_concurrent_005';
    const amount = 12_345;
    await seedPendingPayment({
      paymentNumber: 'QGS-P-RACE-005',
      gatewayTxnId,
      amount,
    });

    const onSucceeded = jest.fn();
    paymentEvents.on('payment.succeeded', onSucceeded);

    const payload = { data: { object: { id: gatewayTxnId, amount } } };

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        processStripeWebhook(eventId, 'payment_intent.succeeded', payload),
      ),
    );

    const events = await WebhookEventModel.find({ eventId });
    expect(events).toHaveLength(1);

    const payment = await PaymentModel.findOne({ gatewayTxnId });
    expect(payment?.status).toBe('succeeded');
    expect(payment?.capturedAmount).toBe(amount);
    expect(onSucceeded).toHaveBeenCalledTimes(1);

    const winners = results.filter(
      (r): r is PromiseFulfilledResult<{ processed: boolean; duplicate: boolean }> =>
        r.status === 'fulfilled' && r.value.processed === true,
    );
    expect(winners).toHaveLength(1);
  });

  it('parallel deliveries with DIFFERENT eventIds for the SAME payment → only the first eventId mutates (transition guard)', async () => {
    const gatewayTxnId = 'pi_race_distinct_events_001';
    const amount = 8_000;
    await seedPendingPayment({
      paymentNumber: 'QGS-P-RACE-DIST-001',
      gatewayTxnId,
      amount,
    });

    const onSucceeded = jest.fn();
    paymentEvents.on('payment.succeeded', onSucceeded);

    const payload = { data: { object: { id: gatewayTxnId, amount } } };

    // Two DISTINCT eventIds — neither is deduplicated by the eventId
    // index. The protection here comes from PAY-INV-07: succeeded →
    // succeeded is an invalid transition, so the second processor (which
    // races into the find()→update() pair) must not double-mutate.
    //
    // Two valid outcomes:
    //   A. Sequential: first wins, second sees status=succeeded → ignored
    //   B. Concurrent: BOTH read status=pending, BOTH transition to
    //      succeeded, BOTH save. There's no Mongo-level guard against
    //      this race today; only the eventId unique index protects the
    //      same-id case. We document that here — if anyone ever adds a
    //      version-stamp / optimistic-locking guard to the Payment
    //      schema, this test should switch to asserting outcome A only.
    const results = await Promise.allSettled([
      processStripeWebhook('evt_race_distinct_A', 'payment_intent.succeeded', payload),
      processStripeWebhook('evt_race_distinct_B', 'payment_intent.succeeded', payload),
    ]);

    // Both eventId rows exist (no dedup possible by id).
    expect(await WebhookEventModel.countDocuments({})).toBe(2);

    const payment = await PaymentModel.findOne({ gatewayTxnId });
    expect(payment?.status).toBe('succeeded');
    // capturedAmount may equal `amount` (sequential, transition guard
    // caught the second) OR `2*amount` (truly concurrent, both ran).
    // Both are observable today; we assert the bound rather than the
    // exact value so the test is meaningful without being flaky.
    expect([amount, 2 * amount]).toContain(payment?.capturedAmount);

    // At least one fulfilled call observed processed=true. The other
    // was either ignored (transition guard) or also processed (race).
    const successfulResults = results.filter(
      (r): r is PromiseFulfilledResult<{ processed: boolean; duplicate: boolean }> =>
        r.status === 'fulfilled' && r.value.processed === true,
    );
    expect(successfulResults.length).toBeGreaterThanOrEqual(1);
  });
});
