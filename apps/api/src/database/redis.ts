import Redis from 'ioredis';
import { getConfig } from '../config/env';

let _redisClient: Redis | null = null;

/**
 * Create and connect to Redis with proper retry and error handling.
 */
export function createRedisClient(): Redis {
  const config = getConfig();

  const client = new Redis({
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,
    retryStrategy(times: number): number | null {
      if (times > 10) {
        console.error('Redis: max retries reached, giving up'); // eslint-disable-line no-console
        return null;
      }
      return Math.min(times * 200, 5000);
    },
    lazyConnect: true,
  });

  client.on('error', (err) => {
    console.error('Redis connection error:', err); // eslint-disable-line no-console
  });

  client.on('connect', () => {
    console.warn('Redis connected'); // eslint-disable-line no-console
  });

  _redisClient = client;
  return client;
}

export function getRedisClient(): Redis {
  if (!_redisClient) {
    throw new Error('Redis client not initialized. Call createRedisClient() first.');
  }
  return _redisClient;
}

export async function disconnectRedis(): Promise<void> {
  if (_redisClient) {
    await _redisClient.quit();
    _redisClient = null;
  }
}
