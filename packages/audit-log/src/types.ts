import type { Document, Types } from 'mongoose';
import type { Request } from 'express';

export type AuditAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'status_change'
  | 'assign'
  | 'reassign'
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'export'
  | 'bulk_action'
  | 'convert'
  | 'merge'
  | 'refund'
  | 'void'
  | 'payment_capture'
  | 'config_change'
  | 'approve'
  | 'reject'
  | 'execute';

export type AuditSeverity =
  | 'info'
  | 'low'
  | 'medium'
  | 'high'
  | 'warning'
  | 'critical';

export type AuditActorType =
  | 'super_admin'
  | 'admin'
  | 'office_manager'
  | 'senior_staff'
  | 'staff'
  | 'client'
  | 'student'
  | 'system'
  | 'cron';

export interface AuditChanges {
  [field: string]: {
    from: unknown;
    to: unknown;
  };
}

export interface AuditMetadata {
  ipAddress?: string;
  userAgent?: string;
  requestMethod?: string;
  requestPath?: string;
  sessionId?: string;
  geoLocation?: string;
}

export interface IAuditLog {
  actor: Types.ObjectId;
  actorType: AuditActorType;
  action: AuditAction;
  resource: string;
  resourceId: Types.ObjectId;
  resourceNumber?: string;
  changes?: AuditChanges;
  description?: string;
  metadata?: AuditMetadata;
  severity: AuditSeverity;
  timestamp: Date;
}

export interface IAuditLogDocument extends IAuditLog, Document {
  _id: Types.ObjectId;
}

export interface AuditEntry {
  actor: string;
  actorType: AuditActorType;
  action: AuditAction;
  resource: string;
  resourceId: string;
  resourceNumber?: string;
  changes?: AuditChanges;
  description?: string;
  metadata?: AuditMetadata;
  severity: AuditSeverity;
}

export interface AuditMiddlewareOptions {
  resource: string;
  getActorId?: (doc: Document) => string;
  getSeverity?: (action: string) => AuditSeverity;
}

/**
 * Canonical DI shape for audit logging, exported so every consuming
 * `*RouteDeps` interface can reference it instead of duplicating
 * `{ log: (entry: Record<string, unknown>) => Promise<void> }` inline.
 *
 * Kept intentionally loose at the DI boundary: route handlers build
 * entries as plain records; the real `@nugen/audit-log` service
 * accepts strict `AuditEntry`. The consuming app bridges the two
 * with a thin adapter at injection time (see `apps/api/src/server.ts`).
 */
export interface AuditLogDI {
  log: (entry: Record<string, unknown>) => Promise<void>;
  logFromRequest: (
    req: Request,
    entry: Record<string, unknown>,
  ) => Promise<void>;
}
