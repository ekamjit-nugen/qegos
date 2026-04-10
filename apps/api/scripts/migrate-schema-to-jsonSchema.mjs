import { MongoClient } from 'mongodb';

const uri = 'mongodb://admin:password123@localhost:27017/qegos-dev?authSource=admin';
const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db('qegos-dev');
  const col = db.collection('formmappingversions');

  const before = await col.countDocuments({ schema: { $exists: true } });
  console.log(`Versions with legacy "schema" field: ${before}`);

  if (before > 0) {
    const result = await col.updateMany(
      { schema: { $exists: true } },
      { $rename: { schema: 'jsonSchema' } },
    );
    console.log(`Renamed ${result.modifiedCount} documents`);
  }

  const after = await col.countDocuments({ jsonSchema: { $exists: true } });
  const stillOld = await col.countDocuments({ schema: { $exists: true } });
  console.log(`Versions with jsonSchema now: ${after}`);
  console.log(`Versions with legacy schema remaining: ${stillOld}`);
} finally {
  await client.close();
}
