import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

/**
 * Request context stored in AsyncLocalStorage.
 * Available anywhere in the async call chain without explicit threading.
 */
export interface RequestContext {
  /** Unique request ID (UUID v4) — set once per inbound HTTP request */
  requestId: string;
  /** Authenticated user ID (set after auth middleware runs) */
  userId?: string;
  /** User type (e.g. 0=super_admin, 1=admin, etc.) */
  userType?: number;
  /** HTTP method (GET, POST, etc.) */
  method?: string;
  /** Request path */
  path?: string;
  /** Request start time for duration calculation */
  startTime: number;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context from AsyncLocalStorage.
 * Returns undefined if called outside a request scope.
 */
export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Get the current request ID, or 'no-context' if outside a request scope.
 */
export function getRequestId(): string {
  return asyncLocalStorage.getStore()?.requestId ?? 'no-context';
}

/**
 * Generate a new request ID (UUID v4).
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Run a function within a new request context.
 * Used by the request ID middleware to establish context for the entire request lifecycle.
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Update the current request context (e.g. after auth middleware sets userId).
 * Mutates the existing store — safe because AsyncLocalStorage stores are per-request.
 */
export function updateContext(updates: Partial<RequestContext>): void {
  const store = asyncLocalStorage.getStore();
  if (store) {
    Object.assign(store, updates);
  }
}

export { asyncLocalStorage };
