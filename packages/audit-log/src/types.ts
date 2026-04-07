import type { Document, Types } from 'mongoose';

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
  | 'config_change';

export type AuditSeverity = 'info' | 'warning' | 'critical';

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
