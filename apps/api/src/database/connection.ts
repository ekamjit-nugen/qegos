import mongoose from 'mongoose';
import { getConfig } from '../config/env';

/**
 * Connect to MongoDB with proper options.
 *
 * Production tuning:
 * - autoIndex disabled (indexes created via ensurePerformanceIndexes)
 * - maxPoolSize sized for concurrent analytics + API queries
 * - minPoolSize keeps warm connections for latency
 * - socketTimeoutMS prevents hung connections
 * - serverSelectionTimeoutMS fast failover
 */
export async function connectDatabase(): Promise<typeof mongoose> {
  const config = getConfig();
  const isProd = config.NODE_ENV === 'production';

  const connection = await mongoose.connect(config.MONGODB_URI, {
    autoIndex: !isProd,
    maxPoolSize: isProd ? 50 : 10,
    minPoolSize: isProd ? 5 : 1,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 5000,
    heartbeatFrequencyMS: 10000,
  });

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err); // eslint-disable-line no-console
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected'); // eslint-disable-line no-console
  });

  return connection;
}

/**
 * Get the default Mongoose connection.
 */
export function getConnection(): mongoose.Connection {
  return mongoose.connection;
}

/**
 * Disconnect from MongoDB gracefully.
 */
export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
