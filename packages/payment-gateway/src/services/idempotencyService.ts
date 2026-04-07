import type Redis from 'ioredis';
import type { IdempotencyCachedResponse } from '../types';

const KEY_PREFIX = 'idempotency:';
const DEFAULT_TTL_SECONDS = 86400; // 24 hours

let _redis: Redis | null = null;

/**
 * Initialize the idempotency service with a Redis client.
 */
export function initIdempotencyService(redis: Redis): void {
  _redis = redis;
}

function getRedis(): Redis {
  if (!_redis) {
    throw new Error('Idempotency service not initialized. Call initIdempotencyService first.');
  }
  return _redis;
}

/**
 * PAY-INV-01: Check if an idempotency key has already been processed.
 * Returns the cached response if the key exists, null if it's a new key.
 */
export async function checkIdempotencyKey(
  key: string,
): Promise<IdempotencyCachedResponse | null> {
  const redis = getRedis();
  const cacheKey = `${KEY_PREFIX}${key}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as IdempotencyCachedResponse;
    }
    return null;
  } catch {
    // Redis failure is non-fatal — proceed without cache
    // (slightly less safe, but maintains availability)
    return null;
  }
}

/**
 * Store a response for an idempotency key with 24hr TTL.
 */
export async function storeIdempotencyResponse(
  key: string,
  response: IdempotencyCachedResponse,
): Promise<void> {
  const redis = getRedis();
  const cacheKey = `${KEY_PREFIX}${key}`;

  try {
    await redis.set(
      cacheKey,
      JSON.stringify(response),
      'EX',
      DEFAULT_TTL_SECONDS,
    );
  } catch {
    // Redis failure is non-fatal — the unique index on Payment.idempotencyKey
    // provides the hard guarantee. Redis is the fast path.
  }
}

/**
 * Remove an idempotency key (e.g., if the operation failed and should be retryable).
 */
export async function removeIdempotencyKey(key: string): Promise<void> {
  const redis = getRedis();
  const cacheKey = `${KEY_PREFIX}${key}`;

  try {
    await redis.del(cacheKey);
  } catch {
    // Non-fatal
  }
}
