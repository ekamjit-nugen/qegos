import rateLimit, { type Options } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import type Redis from 'ioredis';
import type { RateLimiterConfig } from './types';

let _redisClient: Redis | null = null;

export function initRateLimiter(redisClient: Redis): void {
  _redisClient = redisClient;
}

export function getRedisClient(): Redis | null {
  return _redisClient;
}

/**
 * Create a rate limiter middleware.
 * Uses Redis store when available, falls back to in-memory.
 */
export function createLimiter(config: RateLimiterConfig): RequestHandler {
  // Build options without the store first
  const options: Partial<Options> = {
    windowMs: config.windowMs,
    max: config.max,
    message: {
      status: 429,
      code: 'RATE_LIMITED',
      message: config.message || 'Too many requests. Please try again later.',
    },
    standardHeaders: config.standardHeaders ?? true,
    legacyHeaders: config.legacyHeaders ?? false,
    skipSuccessfulRequests: config.skipSuccessfulRequests ?? false,
    skipFailedRequests: config.skipFailedRequests ?? false,
  };

  if (config.keyGenerator) {
    options.keyGenerator = config.keyGenerator;
  }

  // Add Redis store if client is available
  if (_redisClient) {
    // Dynamic import to avoid requiring rate-limit-redis when Redis is not available
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { RedisStore } = require('rate-limit-redis') as {
        RedisStore: new (config: {
          sendCommand: (...args: string[]) => Promise<unknown>;
          prefix?: string;
        }) => unknown;
      };
      options.store = new RedisStore({
        sendCommand: (...args: string[]) =>
          (_redisClient as Redis).call(args[0], ...args.slice(1)) as Promise<unknown>,
        prefix: 'rl:',
      }) as unknown as Options['store'];
    } catch {
      // Redis store not available, fall back to in-memory
    }
  }

  return rateLimit(options);
}
