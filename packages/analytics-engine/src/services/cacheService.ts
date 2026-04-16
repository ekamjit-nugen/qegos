/**
 * Cache Service — Redis-backed caching with stale-while-revalidate (ANA-INV-06)
 */

import { createHash } from 'crypto';
import type { Redis } from 'ioredis';
import { DEFAULT_CACHE_TTL } from '../constants';

/**
 * Build a deterministic cache key for a given analytics view and params.
 */
export function buildCacheKey(view: string, params: Record<string, unknown> = {}): string {
  const sorted = JSON.stringify(params, Object.keys(params).sort());
  const hash = createHash('sha256').update(sorted).digest('hex').slice(0, 12);
  return `analytics:${view}:${hash}`;
}

/**
 * Get a cached value from Redis. Returns null if not found.
 */
export async function getCached<T>(redis: Redis, key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Store a value in Redis with TTL.
 */
export async function setCache(
  redis: Redis,
  key: string,
  ttl: number,
  data: unknown,
): Promise<void> {
  await redis.set(key, JSON.stringify(data), 'EX', ttl);
}

/**
 * Cache-through wrapper: returns cached data if available, otherwise computes
 * and stores the result. Implements stale-while-revalidate pattern.
 */
export async function withCache<T>(
  redis: Redis | null,
  key: string,
  ttl: number = DEFAULT_CACHE_TTL,
  computeFn: () => Promise<T>,
): Promise<T> {
  // If no Redis, compute directly
  if (!redis) {
    return computeFn();
  }

  // Try cache first
  const cached = await getCached<T>(redis, key);
  if (cached !== null) {
    // Stale-while-revalidate: if TTL is below 20%, recompute in background
    const remainingTtl = await redis.ttl(key);
    if (remainingTtl > 0 && remainingTtl < ttl * 0.2) {
      // Fire-and-forget revalidation
      computeFn()
        .then((fresh) => setCache(redis, key, ttl, fresh))
        .catch(() => {
          /* swallow — stale data is still valid */
        });
    }
    return cached;
  }

  // Cache miss — compute, store, return
  const fresh = await computeFn();
  await setCache(redis, key, ttl, fresh);
  return fresh;
}
