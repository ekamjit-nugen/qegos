import type { Document, Model, Types } from 'mongoose';

// ─── Erasure Request ───────────────────────────────────────────────────────

export type ErasureRequestStatus =
  | 'pending'
  | 'approved'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'rejected';

export const ERASURE_REQUEST_STATUSES: ErasureRequestStatus[] = [
  'pending',
  'approved',
  'in_progress',
  'completed',
  'failed',
  'rejected',
];

export interface IErasureRequest {
  userId: Types.ObjectId;
  requestedBy: Types.ObjectId;
  status: ErasureRequestStatus;
  reason?: string;
  rejectionReason?: string;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  executedAt?: Date;
  modelsProcessed: string[];
  recordsAnonymized: number;
  recordsDeleted: number;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IErasureRequestDocument extends IErasureRequest, Document {}

// ─── Data Export ───────────────────────────────────────────────────────────

export type DataExportStatus = 'pending' | 'processing' | 'ready' | 'expired' | 'failed';

export const DATA_EXPORT_STATUSES: DataExportStatus[] = [
  'pending',
  'processing',
  'ready',
  'expired',
  'failed',
];

export type DataExportFormat = 'json' | 'csv';

export interface IDataExport {
  userId: Types.ObjectId;
  requestedBy: Types.ObjectId;
  status: DataExportStatus;
  format: DataExportFormat;
  fileUrl?: string;
  fileSize?: number;
  modelsIncluded: string[];
  recordCount: number;
  expiresAt?: Date;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDataExportDocument extends IDataExport, Document {}

// ─── Retention Policy ──────────────────────────────────────────────────────

export type RetentionAction = 'anonymize' | 'soft_delete' | 'hard_delete';

export interface RetentionPolicyConfig {
  modelName: string;
  retentionDays: number;
  action: RetentionAction;
  dateField: string;
  filter?: Record<string, unknown>;
}

// ─── Model Configuration for Erasure/Export ────────────────────────────────

export interface ModelFieldConfig {
  /** Display name for the model in exports */
  displayName: string;
  /** The Mongoose model instance. Typed as Model<any> because Model<T> is
   *  invariant in Mongoose; `any` at this DI boundary avoids per-config
   *  `as never` casts in consumers. See docs — same pattern used in
   *  broadcast-engine / notification-engine. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>;
  /** Field that references the user (e.g. 'userId', 'senderId') */
  userIdField: string;
  /** Fields containing PII to anonymize (field → replacement value) */
  piiFields: Record<string, string>;
  /** Fields to include in data export (empty = all non-PII) */
  exportFields?: string[];
  /** Fields to exclude from export (e.g. encrypted fields) */
  exportExclude?: string[];
  /** Whether to hard-delete instead of anonymize */
  hardDelete?: boolean;
}

// ─── Package Config ────────────────────────────────────────────────────────

export interface DataLifecycleConfig {
  /** Grace period before erasure request can be executed (days, default 30) */
  erasureGracePeriodDays?: number;
  /** Export file expiry (hours, default 48) */
  exportExpiryHours?: number;
  /** Retention policies per model */
  retentionPolicies?: RetentionPolicyConfig[];
}

// ─── Route Dependencies ────────────────────────────────────────────────────

export interface DataLifecycleRouteDeps {
  ErasureRequestModel: Model<IErasureRequestDocument>;
  DataExportModel: Model<IDataExportDocument>;
  authenticate: import('express').RequestHandler;
  checkPermission: import('@nugen/rbac').CheckPermissionFn;
  auditLog: import('@nugen/audit-log').AuditLogDI;
  modelConfigs: Map<string, ModelFieldConfig>;
  config: DataLifecycleConfig;
}
