/**
 * Unit tests for the payroo rename data migration.
 *
 * The migration ships as `apps/api/src/scripts/payrooRename.ts`. The
 * pure logic — `runPayrooRename(db, opts)` — takes a MongoDB `Db`-like
 * handle, so this test stubs that interface in-memory: each collection
 * is a Map<string, doc>, and `updateMany` / `countDocuments` walk that
 * Map applying the same predicates the real driver would.
 *
 * Coverage:
 *   - dry-run reports counts, mutates nothing
 *   - apply rewrites every payzoo string + renames the field-level
 *     payzooEnabled / payzooPublicKey keys
 *   - re-running apply is a no-op (idempotent)
 *   - field-rename collision: when both payzooEnabled AND payrooEnabled
 *     exist on the same doc, the stale key is dropped (no $rename throw)
 *   - refunds[] array elements: only the payzoo entries are touched, a
 *     mixed-array stripe entry is left alone
 *   - mixed legacy state across all three collections produces a single
 *     "complete=true" result after one apply pass
 */

import { runPayrooRename } from '../../src/scripts/payrooRename';

// ─── In-memory Db mock ────────────────────────────────────────────────────

type Doc = Record<string, unknown> & { _id: string };
type CollectionStore = Map<string, Doc>;

interface FakeCollection {
  countDocuments(filter: Record<string, unknown>): Promise<number>;
  updateMany(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    opts?: { arrayFilters?: Array<Record<string, unknown>> },
  ): Promise<{ modifiedCount: number }>;
  _store(): CollectionStore;
}

interface FakeDb {
  collection(name: string): FakeCollection;
}

/** Read a dotted path on a doc (e.g. 'refunds.gateway' → returns array of values). */
function readPath(doc: Doc, path: string): unknown[] {
  const parts = path.split('.');
  let current: unknown[] = [doc];
  for (const part of parts) {
    const next: unknown[] = [];
    for (const v of current) {
      if (v == null) {
        continue;
      }
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item && typeof item === 'object' && part in (item as Record<string, unknown>)) {
            next.push((item as Record<string, unknown>)[part]);
          }
        }
      } else if (typeof v === 'object' && part in (v as Record<string, unknown>)) {
        next.push((v as Record<string, unknown>)[part]);
      }
    }
    current = next;
  }
  return current;
}

/** Match a single filter clause `{ key: <expr> }` against a doc. */
function matchClause(doc: Doc, key: string, expr: unknown): boolean {
  if (typeof expr === 'object' && expr !== null) {
    const e = expr as Record<string, unknown>;
    if ('$exists' in e) {
      const present = readPath(doc, key).length > 0;
      return present === Boolean(e.$exists);
    }
  }
  // Equality (incl. dotted-array)
  const values = readPath(doc, key);
  return values.some((v) => v === expr);
}

function matchFilter(doc: Doc, filter: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(filter)) {
    if (!matchClause(doc, k, v)) {
      return false;
    }
  }
  return true;
}

function makeCollection(seed: Doc[] = []): FakeCollection {
  const store: CollectionStore = new Map(seed.map((d) => [d._id, structuredClone(d)]));

  async function countDocuments(filter: Record<string, unknown>): Promise<number> {
    let n = 0;
    for (const doc of store.values()) {
      if (matchFilter(doc, filter)) {
        n += 1;
      }
    }
    return n;
  }

  async function updateMany(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    opts?: { arrayFilters?: Array<Record<string, unknown>> },
  ): Promise<{ modifiedCount: number }> {
    let modified = 0;
    for (const doc of store.values()) {
      if (!matchFilter(doc, filter)) {
        continue;
      }

      const $set = (update.$set ?? {}) as Record<string, unknown>;
      const $unset = (update.$unset ?? {}) as Record<string, unknown>;
      const $rename = (update.$rename ?? {}) as Record<string, string>;

      let touched = false;

      // $set top-level + dotted (with arrayFilters $[el].field)
      for (const [path, value] of Object.entries($set)) {
        if (path.includes('$[')) {
          // refunds.$[el].gateway pattern — apply to matching subdocs
          const m = /^([^.]+)\.\$\[(\w+)\]\.(.+)$/.exec(path);
          if (!m) {
            throw new Error(`Unsupported path: ${path}`);
          }
          const [, arrField, _alias, subField] = m;
          const arr = doc[arrField];
          if (!Array.isArray(arr)) {
            continue;
          }
          const af = (opts?.arrayFilters ?? []).find((f) =>
            Object.keys(f).every((k) => k.startsWith(`${_alias}.`)),
          );
          if (!af) {
            throw new Error('Missing arrayFilter for $[el]');
          }
          for (const item of arr) {
            if (!item || typeof item !== 'object') {
              continue;
            }
            const itemMatches = Object.entries(af).every(([k, expected]) => {
              const subKey = k.replace(`${_alias}.`, '');
              return (item as Record<string, unknown>)[subKey] === expected;
            });
            if (itemMatches) {
              (item as Record<string, unknown>)[subField] = value;
              touched = true;
            }
          }
        } else {
          if (doc[path] !== value) {
            doc[path] = value;
            touched = true;
          }
        }
      }

      // $unset
      for (const key of Object.keys($unset)) {
        if (key in doc) {
          delete doc[key];
          touched = true;
        }
      }

      // $rename
      for (const [from, to] of Object.entries($rename)) {
        if (from in doc) {
          doc[to] = doc[from];
          delete doc[from];
          touched = true;
        }
      }

      if (touched) {
        modified += 1;
      }
    }
    return { modifiedCount: modified };
  }

  return { countDocuments, updateMany, _store: () => store };
}

function makeDb(seed: { payments?: Doc[]; configs?: Doc[]; webhooks?: Doc[] }): FakeDb {
  const collections: Record<string, FakeCollection> = {
    payments: makeCollection(seed.payments),
    paymentgatewayconfigs: makeCollection(seed.configs),
    webhookevents: makeCollection(seed.webhooks),
  };
  return {
    collection(name: string): FakeCollection {
      const c = collections[name];
      if (!c) {
        throw new Error(`Unknown collection: ${name}`);
      }
      return c;
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('payrooRename migration', () => {
  it('dry-run reports counts and mutates nothing', async () => {
    const db = makeDb({
      payments: [
        { _id: 'p1', gateway: 'payzoo' },
        { _id: 'p2', gateway: 'stripe' },
      ],
      configs: [
        { _id: 'c1', primaryGateway: 'payzoo', payzooEnabled: true, payzooPublicKey: 'pk_x' },
      ],
      webhooks: [{ _id: 'w1', gateway: 'payzoo' }],
    });

    const result = await runPayrooRename(db as never, { dryRun: true });

    // Reported correctly
    expect(result.dryRun).toBe(true);
    expect(result.collections.payments.gatewayPayzoo).toBe(1);
    expect(result.collections.paymentgatewayconfigs.primaryGatewayPayzoo).toBe(1);
    expect(result.collections.paymentgatewayconfigs.payzooEnabled).toBe(1);
    expect(result.collections.paymentgatewayconfigs.payzooPublicKey).toBe(1);
    expect(result.collections.webhookevents.gatewayPayzoo).toBe(1);
    expect(result.complete).toBe(false); // work pending

    // Nothing migrated counts (dry-run)
    expect(result.collections.payments.gatewayMigrated).toBe(0);
    expect(result.collections.webhookevents.gatewayMigrated).toBe(0);

    // Docs untouched
    const p1 = (db.collection('payments') as ReturnType<typeof makeCollection>)._store().get('p1');
    expect(p1?.gateway).toBe('payzoo');
    const c1 = (db.collection('paymentgatewayconfigs') as ReturnType<typeof makeCollection>)
      ._store()
      .get('c1');
    expect(c1?.primaryGateway).toBe('payzoo');
    expect(c1?.payzooEnabled).toBe(true);
  });

  it('apply rewrites payzoo → payroo and renames field-level keys', async () => {
    const db = makeDb({
      payments: [
        { _id: 'p1', gateway: 'payzoo' },
        { _id: 'p2', gateway: 'stripe' },
        { _id: 'p3', gateway: 'payzoo' },
      ],
      configs: [
        {
          _id: 'c1',
          primaryGateway: 'payzoo',
          payzooEnabled: true,
          payzooPublicKey: 'pk_legacy',
        },
      ],
      webhooks: [
        { _id: 'w1', gateway: 'payzoo' },
        { _id: 'w2', gateway: 'stripe' },
        { _id: 'w3', gateway: 'payzoo' },
      ],
    });

    const result = await runPayrooRename(db as never, { dryRun: false });

    expect(result.complete).toBe(true);
    expect(result.collections.payments.gatewayMigrated).toBe(2);
    expect(result.collections.webhookevents.gatewayMigrated).toBe(2);
    expect(result.collections.paymentgatewayconfigs.primaryGatewayMigrated).toBe(1);
    expect(result.collections.paymentgatewayconfigs.payzooEnabledRenamed).toBe(1);
    expect(result.collections.paymentgatewayconfigs.payzooPublicKeyRenamed).toBe(1);

    // Verify actual mutations
    const payments = (db.collection('payments') as ReturnType<typeof makeCollection>)._store();
    expect(payments.get('p1')?.gateway).toBe('payroo');
    expect(payments.get('p2')?.gateway).toBe('stripe'); // untouched
    expect(payments.get('p3')?.gateway).toBe('payroo');

    const config = (db.collection('paymentgatewayconfigs') as ReturnType<typeof makeCollection>)
      ._store()
      .get('c1');
    expect(config?.primaryGateway).toBe('payroo');
    expect(config?.payrooEnabled).toBe(true);
    expect(config?.payrooPublicKey).toBe('pk_legacy');
    expect('payzooEnabled' in (config ?? {})).toBe(false);
    expect('payzooPublicKey' in (config ?? {})).toBe(false);
  });

  it('re-running apply on a clean DB is a no-op (idempotent)', async () => {
    const db = makeDb({
      payments: [
        { _id: 'p1', gateway: 'payroo' },
        { _id: 'p2', gateway: 'stripe' },
      ],
      configs: [
        {
          _id: 'c1',
          primaryGateway: 'payroo',
          payrooEnabled: true,
          payrooPublicKey: 'pk_clean',
        },
      ],
      webhooks: [{ _id: 'w1', gateway: 'payroo' }],
    });

    const result = await runPayrooRename(db as never, { dryRun: false });

    expect(result.complete).toBe(true);
    expect(result.collections.payments.gatewayPayzoo).toBe(0);
    expect(result.collections.payments.gatewayMigrated).toBe(0);
    expect(result.collections.paymentgatewayconfigs.primaryGatewayMigrated).toBe(0);
    expect(result.collections.paymentgatewayconfigs.payzooEnabledRenamed).toBe(0);
    expect(result.collections.webhookevents.gatewayMigrated).toBe(0);

    const config = (db.collection('paymentgatewayconfigs') as ReturnType<typeof makeCollection>)
      ._store()
      .get('c1');
    expect(config?.payrooEnabled).toBe(true);
    expect(config?.payrooPublicKey).toBe('pk_clean');
  });

  it('field-rename collision: drops stale payzooEnabled when payrooEnabled already exists', async () => {
    const db = makeDb({
      configs: [
        {
          _id: 'c1',
          primaryGateway: 'payroo',
          payzooEnabled: false, // stale
          payrooEnabled: true, // already migrated by hand
          payzooPublicKey: 'pk_stale',
          payrooPublicKey: 'pk_current',
        },
      ],
    });

    const result = await runPayrooRename(db as never, { dryRun: false });

    expect(result.complete).toBe(true);

    const config = (db.collection('paymentgatewayconfigs') as ReturnType<typeof makeCollection>)
      ._store()
      .get('c1');
    // Stale keys gone, current values retained.
    expect('payzooEnabled' in (config ?? {})).toBe(false);
    expect('payzooPublicKey' in (config ?? {})).toBe(false);
    expect(config?.payrooEnabled).toBe(true);
    expect(config?.payrooPublicKey).toBe('pk_current');
  });

  it('payments.refunds[].gateway: only payzoo subdocs are rewritten, stripe siblings untouched', async () => {
    const db = makeDb({
      payments: [
        {
          _id: 'p1',
          gateway: 'stripe', // top-level not migratable
          refunds: [
            { refundId: 'r1', gateway: 'payzoo', amount: 1000 },
            { refundId: 'r2', gateway: 'stripe', amount: 500 },
            { refundId: 'r3', gateway: 'payzoo', amount: 200 },
          ],
        },
        {
          _id: 'p2',
          gateway: 'stripe',
          refunds: [{ refundId: 'r4', gateway: 'stripe', amount: 800 }],
        },
      ],
    });

    const result = await runPayrooRename(db as never, { dryRun: false });

    expect(result.complete).toBe(true);
    expect(result.collections.payments.refundGatewayMigrated).toBe(1); // only p1 had payzoo refunds

    const p1 = (db.collection('payments') as ReturnType<typeof makeCollection>)._store().get('p1');
    const refunds = p1?.refunds as Array<{ refundId: string; gateway: string }>;
    expect(refunds[0].gateway).toBe('payroo'); // rewritten
    expect(refunds[1].gateway).toBe('stripe'); // untouched
    expect(refunds[2].gateway).toBe('payroo'); // rewritten

    const p2 = (db.collection('payments') as ReturnType<typeof makeCollection>)._store().get('p2');
    const p2Refunds = p2?.refunds as Array<{ gateway: string }>;
    expect(p2Refunds[0].gateway).toBe('stripe');
  });

  it('mixed legacy state across all three collections converges to complete=true in one apply', async () => {
    const db = makeDb({
      payments: [
        { _id: 'p1', gateway: 'payzoo' },
        {
          _id: 'p2',
          gateway: 'stripe',
          refunds: [{ refundId: 'r1', gateway: 'payzoo', amount: 100 }],
        },
      ],
      configs: [
        {
          _id: 'c1',
          primaryGateway: 'payzoo',
          payzooEnabled: true,
          payzooPublicKey: 'pk_old',
        },
      ],
      webhooks: [{ _id: 'w1', gateway: 'payzoo' }],
    });

    const result = await runPayrooRename(db as never, { dryRun: false });

    expect(result.complete).toBe(true);
    expect(result.collections.payments.gatewayMigrated).toBe(1);
    expect(result.collections.payments.refundGatewayMigrated).toBe(1);
    expect(result.collections.paymentgatewayconfigs.primaryGatewayMigrated).toBe(1);
    expect(result.collections.paymentgatewayconfigs.payzooEnabledRenamed).toBe(1);
    expect(result.collections.paymentgatewayconfigs.payzooPublicKeyRenamed).toBe(1);
    expect(result.collections.webhookevents.gatewayMigrated).toBe(1);

    // A second pass should be a complete no-op.
    const second = await runPayrooRename(db as never, { dryRun: false });
    expect(second.complete).toBe(true);
    expect(second.collections.payments.gatewayMigrated).toBe(0);
    expect(second.collections.paymentgatewayconfigs.payzooEnabledRenamed).toBe(0);
    expect(second.collections.webhookevents.gatewayMigrated).toBe(0);
  });

  it('clean DB dry-run reports complete=true (nothing pending)', async () => {
    const db = makeDb({
      payments: [{ _id: 'p1', gateway: 'stripe' }],
      configs: [
        {
          _id: 'c1',
          primaryGateway: 'stripe',
          payrooEnabled: false,
          payrooPublicKey: '',
        },
      ],
      webhooks: [{ _id: 'w1', gateway: 'stripe' }],
    });

    const result = await runPayrooRename(db as never, { dryRun: true });
    expect(result.complete).toBe(true);
    expect(result.collections.payments.gatewayPayzoo).toBe(0);
    expect(result.collections.paymentgatewayconfigs.payzooEnabled).toBe(0);
  });
});
