/**
 * Payroo rename data migration.
 *
 * Why this exists:
 *
 *   The "payzoo" → "payroo" rename (commit ca5785b) updated source code
 *   exhaustively but left existing Mongo documents untouched. Any
 *   document persisted before the rename still carries the literal
 *   string "payzoo" — and the schema enums no longer accept that
 *   value, so the next save() / findOneAndUpdate() through Mongoose
 *   on those documents will throw a CastError. Reads still work
 *   (Mongo doesn't validate on read), so the breakage is silent until
 *   someone updates the row.
 *
 *   This migration walks the three collections that store the gateway
 *   string and rewrites every "payzoo" to "payroo":
 *
 *     - payments.gateway                        (top-level enum)
 *     - payments.refunds[].gateway              (sub-doc enum)
 *     - paymentgatewayconfigs.primaryGateway    (singleton enum)
 *     - paymentgatewayconfigs.payzooEnabled     → payrooEnabled (field rename)
 *     - paymentgatewayconfigs.payzooPublicKey   → payrooPublicKey (field rename)
 *     - webhookevents.gateway                   (event-log enum)
 *
 * Safety:
 *   - dry-run by default. Writes ONLY when called with `--apply`.
 *   - idempotent: re-running after a successful apply reports zero
 *     work and exits 0.
 *   - prints before/after counts so it's obvious what changed.
 *   - returns a structured result so the test suite (and a CI check)
 *     can assert the migration is complete in the target database.
 *
 * Usage:
 *   npx ts-node-dev --transpile-only apps/api/src/scripts/payrooRename.ts
 *     → dry run, prints counts, exits 0
 *   npx ts-node-dev --transpile-only apps/api/src/scripts/payrooRename.ts --apply
 *     → writes the rewrites, then re-counts to confirm 0 stragglers
 */

import { MongoClient, type Db } from 'mongodb';

export interface MigrationResult {
  dryRun: boolean;
  collections: {
    payments: {
      gatewayPayzoo: number;
      refundGatewayPayzoo: number;
      gatewayMigrated: number;
      refundGatewayMigrated: number;
    };
    paymentgatewayconfigs: {
      primaryGatewayPayzoo: number;
      payzooEnabled: number;
      payzooPublicKey: number;
      primaryGatewayMigrated: number;
      payzooEnabledRenamed: number;
      payzooPublicKeyRenamed: number;
    };
    webhookevents: {
      gatewayPayzoo: number;
      gatewayMigrated: number;
    };
  };
  /** True if no work was found OR every applied rewrite hit 0 stragglers. */
  complete: boolean;
}

/**
 * Run the migration against an open Mongo `Db` handle. Pure function:
 * no process.exit, no console output beyond what the caller passes in.
 * The CLI shell at the bottom of this file handles I/O and exit codes.
 *
 * Pass `{ dryRun: true }` (default) to only count work. Pass
 * `{ dryRun: false }` to actually write.
 */
export async function runPayrooRename(
  db: Db,
  opts: { dryRun: boolean } = { dryRun: true },
): Promise<MigrationResult> {
  const { dryRun } = opts;

  const payments = db.collection('payments');
  const configs = db.collection('paymentgatewayconfigs');
  const webhooks = db.collection('webhookevents');

  // ─── Count BEFORE ─────────────────────────────────────────────────────
  const paymentsGatewayPayzoo = await payments.countDocuments({ gateway: 'payzoo' });
  const paymentsRefundGatewayPayzoo = await payments.countDocuments({
    'refunds.gateway': 'payzoo',
  });
  const configsPrimaryPayzoo = await configs.countDocuments({ primaryGateway: 'payzoo' });
  const configsPayzooEnabledExists = await configs.countDocuments({
    payzooEnabled: { $exists: true },
  });
  const configsPayzooPublicKeyExists = await configs.countDocuments({
    payzooPublicKey: { $exists: true },
  });
  const webhooksGatewayPayzoo = await webhooks.countDocuments({ gateway: 'payzoo' });

  let gatewayMigrated = 0;
  let refundGatewayMigrated = 0;
  let primaryGatewayMigrated = 0;
  let payzooEnabledRenamed = 0;
  let payzooPublicKeyRenamed = 0;
  let webhookGatewayMigrated = 0;

  if (!dryRun) {
    // ─── payments.gateway ────────────────────────────────────────────────
    if (paymentsGatewayPayzoo > 0) {
      const r = await payments.updateMany({ gateway: 'payzoo' }, { $set: { gateway: 'payroo' } });
      gatewayMigrated = r.modifiedCount;
    }

    // ─── payments.refunds[].gateway ──────────────────────────────────────
    // arrayFilters narrows to elements with gateway === 'payzoo' so we
    // don't churn other refund entries.
    if (paymentsRefundGatewayPayzoo > 0) {
      const r = await payments.updateMany(
        { 'refunds.gateway': 'payzoo' },
        { $set: { 'refunds.$[el].gateway': 'payroo' } },
        { arrayFilters: [{ 'el.gateway': 'payzoo' }] },
      );
      refundGatewayMigrated = r.modifiedCount;
    }

    // ─── paymentgatewayconfigs.primaryGateway ────────────────────────────
    if (configsPrimaryPayzoo > 0) {
      const r = await configs.updateMany(
        { primaryGateway: 'payzoo' },
        { $set: { primaryGateway: 'payroo' } },
      );
      primaryGatewayMigrated = r.modifiedCount;
    }

    // ─── paymentgatewayconfigs.payzooEnabled → payrooEnabled ─────────────
    // Only rename if `payzooEnabled` exists. If the doc somehow has BOTH
    // the new and old key, $rename throws — guard by ensuring payrooEnabled
    // doesn't already exist on the same row, and prefer the existing
    // `payrooEnabled` value (drop the stale key).
    if (configsPayzooEnabledExists > 0) {
      // Drop payzooEnabled where payrooEnabled already exists (collision case)
      await configs.updateMany(
        { payzooEnabled: { $exists: true }, payrooEnabled: { $exists: true } },
        { $unset: { payzooEnabled: '' } },
      );
      // Rename for the rest
      const r = await configs.updateMany(
        { payzooEnabled: { $exists: true } },
        { $rename: { payzooEnabled: 'payrooEnabled' } },
      );
      payzooEnabledRenamed = r.modifiedCount;
    }

    if (configsPayzooPublicKeyExists > 0) {
      await configs.updateMany(
        { payzooPublicKey: { $exists: true }, payrooPublicKey: { $exists: true } },
        { $unset: { payzooPublicKey: '' } },
      );
      const r = await configs.updateMany(
        { payzooPublicKey: { $exists: true } },
        { $rename: { payzooPublicKey: 'payrooPublicKey' } },
      );
      payzooPublicKeyRenamed = r.modifiedCount;
    }

    // ─── webhookevents.gateway ───────────────────────────────────────────
    if (webhooksGatewayPayzoo > 0) {
      const r = await webhooks.updateMany({ gateway: 'payzoo' }, { $set: { gateway: 'payroo' } });
      webhookGatewayMigrated = r.modifiedCount;
    }
  }

  // ─── Count AFTER (always, dry-run too) ────────────────────────────────
  const paymentsGatewayLeft = await payments.countDocuments({ gateway: 'payzoo' });
  const paymentsRefundLeft = await payments.countDocuments({ 'refunds.gateway': 'payzoo' });
  const configsPrimaryLeft = await configs.countDocuments({ primaryGateway: 'payzoo' });
  const configsPayzooEnabledLeft = await configs.countDocuments({
    payzooEnabled: { $exists: true },
  });
  const configsPayzooPublicKeyLeft = await configs.countDocuments({
    payzooPublicKey: { $exists: true },
  });
  const webhooksGatewayLeft = await webhooks.countDocuments({ gateway: 'payzoo' });

  const stragglers =
    paymentsGatewayLeft +
    paymentsRefundLeft +
    configsPrimaryLeft +
    configsPayzooEnabledLeft +
    configsPayzooPublicKeyLeft +
    webhooksGatewayLeft;

  const totalToMigrate =
    paymentsGatewayPayzoo +
    paymentsRefundGatewayPayzoo +
    configsPrimaryPayzoo +
    configsPayzooEnabledExists +
    configsPayzooPublicKeyExists +
    webhooksGatewayPayzoo;

  // Migration is "complete" when:
  //   - dry run with no work needed (totalToMigrate === 0), OR
  //   - apply ran and stragglers === 0
  const complete = dryRun ? totalToMigrate === 0 : stragglers === 0;

  return {
    dryRun,
    collections: {
      payments: {
        gatewayPayzoo: paymentsGatewayPayzoo,
        refundGatewayPayzoo: paymentsRefundGatewayPayzoo,
        gatewayMigrated,
        refundGatewayMigrated,
      },
      paymentgatewayconfigs: {
        primaryGatewayPayzoo: configsPrimaryPayzoo,
        payzooEnabled: configsPayzooEnabledExists,
        payzooPublicKey: configsPayzooPublicKeyExists,
        primaryGatewayMigrated,
        payzooEnabledRenamed,
        payzooPublicKeyRenamed,
      },
      webhookevents: {
        gatewayPayzoo: webhooksGatewayPayzoo,
        gatewayMigrated: webhookGatewayMigrated,
      },
    },
    complete,
  };
}

// ─── CLI entry ──────────────────────────────────────────────────────────────
// `node --loader ts-node/esm` would normally guard this, but Node's CommonJS
// build of this file ALSO needs a guard so importing it from a test file
// doesn't kick off a Mongo connection. We detect "ran as a script" by
// comparing process.argv[1] to the resolved filename — works for both
// ts-node-dev and the compiled .js.

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const uri =
    process.env.MONGODB_URI ??
    'mongodb://admin:password123@localhost:27017/qegos-dev?authSource=admin';

  const dbName = ((): string => {
    try {
      const u = new URL(uri);
      const n = u.pathname.replace(/^\//, '');
      return n.length > 0 ? n : 'qegos-dev';
    } catch {
      return 'qegos-dev';
    }
  })();

  // eslint-disable-next-line no-console
  console.log(`[payrooRename] connecting to ${dbName} (apply=${apply})`);
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const result = await runPayrooRename(db, { dryRun: !apply });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));

    if (!result.complete) {
      // eslint-disable-next-line no-console
      console.error(
        apply
          ? '[payrooRename] APPLY ran but stragglers remain — investigate.'
          : '[payrooRename] DRY RUN — work pending. Re-run with --apply to migrate.',
      );
      process.exit(apply ? 1 : 0);
    }
    // eslint-disable-next-line no-console
    console.log('[payrooRename] complete — no payzoo data remains.');
  } finally {
    await client.close();
  }
}

// Only run when invoked as a script (not when imported by a test).
if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[payrooRename] FATAL', err);
    process.exit(1);
  });
}
