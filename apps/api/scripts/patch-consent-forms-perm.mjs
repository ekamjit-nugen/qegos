/**
 * Idempotent migration: add `consent_forms` permission to existing roles.
 *
 * Mirrors the matrix in packages/rbac/src/seed/defaultRoles.ts so that
 * roles already in the database get the new permission without a full
 * re-seed. Safe to run multiple times.
 *
 *   node apps/api/scripts/patch-consent-forms-perm.mjs
 */

import { MongoClient } from 'mongodb';

const uri = 'mongodb://admin:password123@localhost:27017/qegos-dev?authSource=admin';
const client = new MongoClient(uri);

const adminReadAll = {
  resource: 'consent_forms',
  actions: ['read'],
  scope: 'all',
};

const clientCreateReadOwn = {
  resource: 'consent_forms',
  actions: ['create', 'read'],
  scope: 'own',
};

const updates = [
  { name: 'super_admin', perm: adminReadAll },
  { name: 'admin', perm: adminReadAll },
  { name: 'office_manager', perm: adminReadAll },
  { name: 'client', perm: clientCreateReadOwn },
  { name: 'student', perm: clientCreateReadOwn },
];

try {
  await client.connect();
  const db = client.db('qegos-dev');
  const roles = db.collection('roles');

  for (const { name, perm } of updates) {
    const role = await roles.findOne({ name });
    if (!role) {
      console.log(`[skip] role not found: ${name}`);
      continue;
    }
    const existing = (role.permissions || []).find((p) => p.resource === 'consent_forms');
    if (existing) {
      // Replace existing in place — handles re-runs and updates to actions/scope
      const result = await roles.updateOne(
        { name, 'permissions.resource': 'consent_forms' },
        { $set: { 'permissions.$': perm } },
      );
      console.log(`[update] ${name}: matched=${result.matchedCount} modified=${result.modifiedCount}`);
    } else {
      const result = await roles.updateOne(
        { name },
        { $push: { permissions: perm } },
      );
      console.log(`[push] ${name}: matched=${result.matchedCount} modified=${result.modifiedCount}`);
    }
  }

  // Verify
  console.log('\nVerification:');
  for (const { name } of updates) {
    const role = await roles.findOne({ name });
    const found = (role?.permissions || []).find((p) => p.resource === 'consent_forms');
    console.log(`  ${name}.consent_forms =`, JSON.stringify(found));
  }
} finally {
  await client.close();
}
