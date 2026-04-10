import { MongoClient } from 'mongodb';

const uri = 'mongodb://admin:password123@localhost:27017/qegos-dev?authSource=admin';
const client = new MongoClient(uri);

const formMappingsPerm = {
  resource: 'form_mappings',
  actions: ['create', 'read', 'update', 'delete'],
  scope: 'all',
};
const formMappingsReadOnlyPerm = {
  resource: 'form_mappings',
  actions: ['read'],
  scope: 'all',
};

const updates = [
  { name: 'super_admin', perm: formMappingsPerm },
  { name: 'admin', perm: formMappingsPerm },
  { name: 'office_manager', perm: formMappingsReadOnlyPerm },
  { name: 'senior_staff', perm: formMappingsReadOnlyPerm },
  { name: 'staff', perm: formMappingsReadOnlyPerm },
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
    const existing = (role.permissions || []).find((p) => p.resource === 'form_mappings');
    if (existing) {
      // Replace existing
      const result = await roles.updateOne(
        { name, 'permissions.resource': 'form_mappings' },
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
  const superAdmin = await roles.findOne({ name: 'super_admin' });
  const formMappingsFound = (superAdmin.permissions || []).find((p) => p.resource === 'form_mappings');
  console.log('\nsuper_admin.form_mappings =', JSON.stringify(formMappingsFound));
} finally {
  await client.close();
}
