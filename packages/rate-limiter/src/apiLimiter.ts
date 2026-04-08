import type { Request, RequestHandler } from 'express';
import { createLimiter } from './createLimiter';
import type { ApiLimiterConfig } from './types';

/**
 * General API rate limiter: 100 requests/min per user (NFR-03).
 * Uses userId from JWT token if available, falls back to IP.
 */
export function createApiLimiter(config?: ApiLimiterConfig): RequestHandler {
  return createLimiter({
    windowMs: config?.windowMs ?? 60 * 1000,
    max: config?.max ?? 100,
    message: 'Too many requests. Please slow down.',
    keyGenerator: (req: Request): string => {
      const user = (req as unknown as Record<string, unknown>).user as { userId?: string } | undefined;
      return `api:${user?.userId ?? req.ip}`;
    },
  });
}
