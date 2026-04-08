import type { Document, Types } from 'mongoose';

// ─── Configuration ────────────────────────────────────────────────────────

export interface XeroConnectorConfig {
  xeroClientId: string;
  xeroClientSecret: string;
  xeroRedirectUri: string;
  xeroScopes: string[];
  encryptionKey: string; // 32+ chars, for AES-256-GCM token encryption
}

export const DEFAULT_XERO_SCOPES: string[] = [
  'openid',
  'profile',
  'email',
  'accounting.transactions',
  'accounting.contacts',
  'accounting.settings.read',
];

// ─── Xero Sync Entity Types ──────────────────────────────────────────────

export type XeroSyncEntityType = 'contact' | 'invoice' | 'payment' | 'credit_note';

export const XERO_SYNC_ENTITY_TYPES: XeroSyncEntityType[] = [
  'contact', 'invoice', 'payment', 'credit_note',
];

export type XeroSyncAction = 'create' | 'update' | 'void' | 'delete';

export const XERO_SYNC_ACTIONS: XeroSyncAction[] = [
  'create', 'update', 'void', 'delete',
];

export type XeroSyncStatus = 'queued' | 'processing' | 'success' | 'failed';

export const XERO_SYNC_STATUSES: XeroSyncStatus[] = [
  'queued', 'processing', 'success', 'failed',
];

// ─── Rate Limiting & Retry Constants ──────────────────────────────────────

/** XRO-INV-03: Max 60 API calls per minute per tenant */
export const XERO_RATE_LIMIT_PER_MINUTE = 60;

/** XRO-INV-05: Exponential backoff delays in ms (1min, 5min, 30min, 2hr) */
export const RETRY_DELAYS_MS: readonly number[] = [
  60_000, 300_000, 1_800_000, 7_200_000,
];

/** XRO-INV-05: Max retry attempts before permanent failure */
export const MAX_RETRIES = 4;

/** XRO-INV-09: Reconciliation mismatch threshold in cents */
export const RECONCILIATION_THRESHOLD_CENTS = 1;

// ─── Xero Config (Singleton DB Model) ────────────────────────────────────

export interface IXeroConfig {
  xeroConnected: boolean;
  xeroTenantId?: string;
  xeroAccessToken?: string;  // AES-256-GCM encrypted (XRO-INV-01)
  xeroRefreshToken?: string; // AES-256-GCM encrypted (XRO-INV-01)
  xeroTokenExpiresAt?: Date;
  xeroRevenueAccountCode?: string; // e.g., "200"
  xeroBankAccountId?: string;
  xeroGstAccountCode?: string;     // Australian GST
  xeroDefaultTaxType?: string;     // "OUTPUT" for sales
  lastSyncAt?: Date;
  syncErrorCount: number;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IXeroConfigDocument extends IXeroConfig, Document {
  _id: Types.ObjectId;
}

// ─── Xero Sync Log ───────────────────────────────────────────────────────

export interface IXeroSyncLog {
  entityType: XeroSyncEntityType;
  entityId: Types.ObjectId;
  xeroEntityId?: string;
  action: XeroSyncAction;
  status: XeroSyncStatus;
  requestPayload: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
  error?: string;
  retryCount: number;
  nextRetryAt?: Date;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IXeroSyncLogDocument extends IXeroSyncLog, Document {
  _id: Types.ObjectId;
}

// ─── GST Calculation ──────────────────────────────────────────────────────

/**
 * XRO-INV-11: Australian GST calculation.
 * GST-inclusive price / 11 = GST component.
 * All values in integer cents.
 */
export function calculateGst(priceInclusiveCents: number): number {
  return Math.round(priceInclusiveCents / 11);
}

// ─── Route Dependencies ───────────────────────────────────────────────────

export interface XeroRouteDeps {
  XeroConfigModel: import('mongoose').Model<IXeroConfigDocument>;
  XeroSyncLogModel: import('mongoose').Model<IXeroSyncLogDocument>;
  OrderModel: import('mongoose').Model<Document>;
  UserModel: import('mongoose').Model<Document>;
  PaymentModel: import('mongoose').Model<Document>;
  redisClient: import('ioredis').Redis;
  authenticate: () => import('express').RequestHandler;
  checkPermission: (resource: string, action: string) => import('express').RequestHandler;
  auditLog: {
    log: (...args: unknown[]) => Promise<void>;
    logFromRequest: (req: unknown, data: Record<string, unknown>) => Promise<void>;
  };
  config: XeroConnectorConfig;
}
