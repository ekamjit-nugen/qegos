import mongoose from 'mongoose';
import { getConfig } from '../config/env';

/**
 * Connect to MongoDB with proper options.
 */
export async function connectDatabase(): Promise<typeof mongoose> {
  const config = getConfig();

  const connection = await mongoose.connect(config.MONGODB_URI, {
    autoIndex: config.NODE_ENV !== 'production',
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
