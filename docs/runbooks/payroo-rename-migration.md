# Runbook: payroo rename data migration

**Owner:** Backend (current on-call)
**Estimated duration:** 5 min per environment
**Maintenance window required:** No — migration is read-then-update with no exclusive locks; in-flight writes are unaffected. Schedule outside peak hours regardless to keep blast radius small if anything surprises us.
**Slack:** `#qegos-deploys` (post before + after)
**Related code:**
- `apps/api/src/scripts/payrooRename.ts` — migration logic
- `apps/api/__tests__/scripts/payrooRename.test.ts` — unit coverage
- Commit `2c38f58` — script + tests
- Commit `ca5785b` — the source-code rename that left the data behind

---

## Why this runbook exists

Commit `ca5785b` ("rename payzoo → payroo") rewrote source code exhaustively: enums, env vars, types, route paths, frontend hooks, fixtures, docs. It did **not** rewrite documents already in Mongo. Any record persisted before that commit still carries the literal string `"payzoo"`.

Reads work fine — Mongo doesn't validate enums on read — so the breakage is silent until the next write touches one of those rows. The first `findOneAndUpdate` against a `payments` row with `gateway: "payzoo"` will throw a `CastError` because the new schema's enum is `['stripe', 'payroo']`. That's a 500 to the user with no clear log signal.

The migration script walks three collections and rewrites every stale string + renames two fields:

| Collection | Operation |
|---|---|
| `payments.gateway` | `"payzoo"` → `"payroo"` |
| `payments.refunds[].gateway` | `"payzoo"` → `"payroo"` (sub-doc, arrayFilters) |
| `paymentgatewayconfigs.primaryGateway` | `"payzoo"` → `"payroo"` |
| `paymentgatewayconfigs.payzooEnabled` | rename → `payrooEnabled` |
| `paymentgatewayconfigs.payzooPublicKey` | rename → `payrooPublicKey` |
| `webhookevents.gateway` | `"payzoo"` → `"payroo"` |

Idempotent — re-running on a clean DB reports zero work.

---

## Pre-flight

1. Confirm a recent automated backup exists for the target environment. Mongo Atlas: Backup → "Take Snapshot Now" if the most recent is more than 6h old. Self-hosted: `mongodump` to a known-good location. **Do not skip — the field renames cannot be reversed automatically.**
2. Confirm you can read the target `MONGODB_URI` from the env you'll run from. Dev: `.env`. Staging/prod: pull from 1Password or the deploy secrets manager — never paste into shell history.
3. Pull `main` (or the integration branch carrying commit `2c38f58` or later) on the runner host.
4. From the repo root: `npm install` if node_modules is stale.

---

## Execution sequence

Run dev → staging → prod, with verification between each. **Do not parallelise environments.**

### 1. Dev

```bash
# Dry run — counts only, mutates nothing.
MONGODB_URI='mongodb://admin:password123@localhost:27017/qegos-dev?authSource=admin' \
  npm --prefix apps/api run migrate:payroo
```

Expected JSON output structure (example with stale data present):

```json
{
  "dryRun": true,
  "collections": {
    "payments": { "gatewayPayzoo": 12, "refundGatewayPayzoo": 3, "gatewayMigrated": 0, "refundGatewayMigrated": 0 },
    "paymentgatewayconfigs": { "primaryGatewayPayzoo": 1, "payzooEnabled": 1, "payzooPublicKey": 1, "primaryGatewayMigrated": 0, "payzooEnabledRenamed": 0, "payzooPublicKeyRenamed": 0 },
    "webhookevents": { "gatewayPayzoo": 47, "gatewayMigrated": 0 }
  },
  "complete": false
}
```

`complete: false` → work pending. If `complete: true`, dev already has no payzoo data; proceed to staging.

```bash
# Apply.
MONGODB_URI='mongodb://admin:password123@localhost:27017/qegos-dev?authSource=admin' \
  npm --prefix apps/api run migrate:payroo -- --apply
```

The script re-counts after applying and exits non-zero if any stragglers remain. Look for `[payrooRename] complete — no payzoo data remains.` on the final line.

**Verification (independent of the script):**

```bash
mongosh "$MONGODB_URI" --quiet --eval '
  db.payments.countDocuments({gateway: "payzoo"}) +
  db.payments.countDocuments({"refunds.gateway": "payzoo"}) +
  db.paymentgatewayconfigs.countDocuments({primaryGateway: "payzoo"}) +
  db.paymentgatewayconfigs.countDocuments({payzooEnabled: {$exists: true}}) +
  db.paymentgatewayconfigs.countDocuments({payzooPublicKey: {$exists: true}}) +
  db.webhookevents.countDocuments({gateway: "payzoo"})
'
```

Must print `0`. If non-zero, **stop** and investigate before touching staging.

### 2. Staging

Same sequence with the staging URI. Post in `#qegos-deploys` before applying:

> Running payroo rename migration in **staging**. Dry-run output: <paste JSON>. Applying now.

After apply, post the verification mongosh output. Smoke-test by hitting the admin gateway-config endpoint (`GET /admin/payments/config`) and confirming `payrooEnabled`/`payrooPublicKey` round-trip cleanly.

### 3. Production

Same sequence with the prod URI. **Two-person rule:** another backend engineer must approve in the deploy thread before `--apply` is run.

Pre-apply checklist:
- [ ] Most recent prod snapshot is < 6h old (verify in Atlas / backup tooling).
- [ ] No active deploy in flight (`kubectl rollout status` or equivalent).
- [ ] Approver acked in the Slack thread.

Then:

```bash
MONGODB_URI="$PROD_MONGODB_URI" npm --prefix apps/api run migrate:payroo            # dry
MONGODB_URI="$PROD_MONGODB_URI" npm --prefix apps/api run migrate:payroo -- --apply  # apply
```

Post-apply: run the verification mongosh count, confirm `0`, post the result + the script's final line in the deploy thread.

---

## Rollback

The string rewrites (`gateway: "payzoo"` → `"payroo"`) are not safely reversible — there's no way to know which rows were originally `payzoo` vs which the migration just rewrote. **Don't try to script a reverse.** If the migration ran but you need to restore the pre-migration state:

1. Restore the snapshot taken in pre-flight to a side cluster.
2. Diff the affected collections against current prod (`mongodump --query` per collection, then `mongodb-compare` or equivalent).
3. Coordinate a maintenance window before swapping clusters.

For the field renames specifically, the inverse is mechanically possible (`$rename: { payrooEnabled: 'payzooEnabled' }`) but **only safe if the new code has not been deployed yet** — once the new schema is live, write paths refuse the legacy field name. If you're rolling back this far, also revert the `ca5785b` source rename.

---

## What "done" looks like

- All three environments report `complete: true` from a fresh dry-run.
- Verification mongosh count returns `0` in all three environments.
- Slack thread closed with: "payroo rename migration: dev ✅ staging ✅ prod ✅".
- Owner adds a row to the deploy log.

---

## After this runbook

This runbook becomes obsolete once all three environments have run the migration. **Delete it** (and this section) once the prod entry in the deploy log is more than 30 days old — keeping a stale runbook around invites someone to re-run the migration "just to be sure" against a clean DB, which is harmless but pollutes audit logs.
