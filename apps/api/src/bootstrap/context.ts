/**
 * AppContext — shared infrastructure published by server.ts to every
 * per-module bootstrap.
 *
 * Intent: shrink server.ts (currently 1600+ lines) by moving per-module
 * wiring into colocated `bootstrap.ts` files. Each bootstrap function takes
 * `AppContext` plus whatever module-specific Mongoose models / services it
 * needs, and returns a `BootstrapResult` that server.ts mounts.
 *
 * This is the trial-slice shape. Grow it (settings, payments, redis, logger,
 * etc.) as more modules are extracted. Don't pre-add fields — add them when
 * the first bootstrap actually needs one.
 */
import type { Router, RequestHandler } from 'express';
import type * as auditLog from '@nugen/audit-log';
import type { CheckPermissionFn } from '@nugen/rbac';

export interface AppContext {
  /** Returns an Express middleware that authenticates via JWT. */
  authenticate: () => RequestHandler;
  /** RBAC permission check factory. */
  checkPermission: CheckPermissionFn;
  /** Audit log DI shape (`log` + `logFromRequest`). */
  auditLogDI: auditLog.AuditLogDI;
}

/**
 * Shape every bootstrap returns. Kept minimal deliberately; extend with
 * `workers?`, `cronSetup?` when a module needs them.
 */
export interface BootstrapResult {
  /** Routers this module contributes. Server.ts mounts them by key. */
  routers?: Record<string, Router>;
}
