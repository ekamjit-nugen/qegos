import { createHash } from 'crypto';
import { DEFAULT_CACHE_TTL } from '../constants';

/**
 * Build a deterministic cache key from view name and params.
 * Key format: analytics:{view}:{md5_hash}
 */
export function buildCacheKey(
  view: string,
  params: Record<string, unknown> = {},
): string {
  const sortedParams = JSON.stringify(params, Object.keys(params).sort());
  const hash = createHash('md5').update(sortedParams).digest('hex').slice(0, 12);
  return `analytics:${view}:${hash}`;
}

/**
 * Get cached data from Redis.
 */
export async function getCached<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  redis: any,
  key: string,
): Promise<T | null> {
  try {
    const cached = await redis.get(key);
    if (!cached) return null;
    return JSON.parse(cached) as T;
  } catch {
    return null;
  }
}

/**
 * Set data in Redis cache with TTL.
 */
export async function setCache(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  redis: any,
  key: string,
  data: unknown,
  ttl: number = DEFAULT_CACHE_TTL,
): Promise<void> {
  try {
    await redis.setex(key, ttl, JSON.stringify(data));
  } catch {
    // Cache write failure is non-fatal
  }
}

/**
 * ANA-INV-06: Cache-aside with stale-while-revalidate pattern.
 * Returns cached data immediately if available.
 * Computes fresh data on cache miss.
 */
export async function withCache<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  redis: any,
  key: string,
  ttl: number,
  computeFn: () => Promise<T>,
): Promise<T> {
  // Try cache first
  const cached = await getCached<T>(redis, key);
  if (cached !== null) {
    return cached;
  }

  // Cache miss — compute and store
  const fresh = await computeFn();
  await setCache(redis, key, fresh, ttl);
  return fresh;
}
