import type { Request, Response, NextFunction } from 'express';
import {
  generateRequestId,
  runWithContext,
  updateContext,
  type RequestContext,
} from '../lib/requestContext';

// Extend Express Request to include requestId
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/**
 * Request ID middleware.
 *
 * 1. Generates a UUID v4 request ID (or reuses X-Request-ID from upstream proxy).
 * 2. Attaches it to `req.requestId` for route handlers.
 * 3. Sets `X-Request-ID` response header for client-side correlation.
 * 4. Wraps the entire request in AsyncLocalStorage context so that any
 *    code in the async call chain can access the request context via
 *    `getRequestContext()` / `getRequestId()`.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Accept upstream request ID (from load balancer, API gateway) or generate new one
  const requestId = (req.headers['x-request-id'] as string) || generateRequestId();

  // Set response header so clients can correlate responses
  res.setHeader('X-Request-ID', requestId);

  // Build initial request context
  const context: RequestContext = {
    requestId,
    method: req.method,
    path: req.originalUrl,
    startTime: Date.now(),
  };

  // Attach to req for easy access in route handlers
  req.requestId = requestId;

  // Run the rest of the middleware chain inside AsyncLocalStorage context
  runWithContext(context, () => {
    next();
  });
}

/**
 * Middleware to update request context with authenticated user info.
 * Call this AFTER auth middleware has populated req.user.
 *
 * Usage: This is called automatically from within the request logging middleware
 * or can be used as a post-auth hook.
 */
export function enrichContextWithUser(req: Request): void {
  const user = (req as unknown as { user?: { userId?: string; userType?: number } }).user;
  if (user) {
    updateContext({
      userId: user.userId,
      userType: user.userType,
    });
  }
}
