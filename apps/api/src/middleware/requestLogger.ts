import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';
import { enrichContextWithUser } from './requestId';

/**
 * HTTP request logging middleware.
 *
 * Logs every request with:
 * - method, path, status code, duration
 * - requestId (from AsyncLocalStorage context)
 * - userId (if authenticated)
 * - content-length of response
 * - user-agent
 *
 * Skips noisy health check endpoints to avoid log pollution.
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip health check endpoints to reduce noise
  if (req.path === '/health' || req.path === '/health/deep') {
    next();
    return;
  }

  const startTime = Date.now();

  // Hook into response finish to log after the response is sent
  res.on('finish', () => {
    // Enrich context with user info (available after auth middleware)
    enrichContextWithUser(req);

    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const contentLength = res.getHeader('content-length') as string | undefined;
    const userAgent = req.headers['user-agent'];
    const ip = req.ip ?? req.socket.remoteAddress;

    const meta: Record<string, unknown> = {
      statusCode,
      duration,
      ip,
    };

    if (contentLength) {
      meta.contentLength = contentLength;
    }
    if (userAgent) {
      meta.userAgent = userAgent;
    }

    // Log level based on status code
    const message = `${req.method} ${req.originalUrl} ${statusCode} ${duration}ms`;

    if (statusCode >= 500) {
      logger.error(message, meta);
    } else if (statusCode >= 400) {
      logger.warn(message, meta);
    } else {
      logger.info(message, meta);
    }
  });

  next();
}
