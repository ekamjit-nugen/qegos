import type { Connection } from 'mongoose';
import type { Redis } from 'ioredis';
import type { XeroConnectorConfig, IXeroConfigDocument, IXeroSyncLogDocument } from './types';
import type { Model } from 'mongoose';
import { createXeroConfigModel } from './models/xeroConfigModel';
import { createXeroSyncLogModel } from './models/xeroSyncLogModel';
import { initTokenService } from './services/tokenService';
import { initXeroClient } from './services/xeroClient';

// ─── Init Result ────────────────────────────────────────────────────────────

export interface XeroConnectorInitResult {
  XeroConfigModel: Model<IXeroConfigDocument>;
  XeroSyncLogModel: Model<IXeroSyncLogDocument>;
}

// ─── Package Initialization ─────────────────────────────────────────────────

/**
 * Initialize @nugen/xero-connector.
 *
 * Creates models and initializes core services (token encryption + client).
 * Sync services and routes are initialized later via createXeroRoutes()
 * which receives app-level model dependencies (OrderModel, UserModel, etc.).
 */
export function init(
  connection: Connection,
  redisClient: Redis,
  config: XeroConnectorConfig,
): XeroConnectorInitResult {
  // 1. Create models
  const XeroConfigModel = createXeroConfigModel(connection);
  const XeroSyncLogModel = createXeroSyncLogModel(connection);

  // 2. Initialize core services
  initTokenService(config.encryptionKey, redisClient, XeroConfigModel);
  initXeroClient(config, redisClient, XeroConfigModel);

  return { XeroConfigModel, XeroSyncLogModel };
}

// ─── Re-exports ─────────────────────────────────────────────────────────────

// Types
export type {
  XeroConnectorConfig,
  IXeroConfig,
  IXeroConfigDocument,
  IXeroSyncLog,
  IXeroSyncLogDocument,
  XeroSyncEntityType,
  XeroSyncAction,
  XeroSyncStatus,
  XeroRouteDeps,
} from './types';

export {
  XERO_SYNC_ENTITY_TYPES,
  XERO_SYNC_ACTIONS,
  XERO_SYNC_STATUSES,
  XERO_RATE_LIMIT_PER_MINUTE,
  RETRY_DELAYS_MS,
  MAX_RETRIES,
  RECONCILIATION_THRESHOLD_CENTS,
  DEFAULT_XERO_SCOPES,
  calculateGst,
} from './types';

// Routes
export { createXeroRoutes } from './routes/xeroRoutes';

// Services (for direct use / cron jobs)
export { retryFailedSyncs, flushOfflineQueue } from './services/retrySyncService';
export { encryptToken, decryptToken } from './services/tokenService';
export { XeroOfflineError } from './services/xeroClient';

// Webhook handling
export { xeroWebhookVerify } from './middleware/xeroWebhookVerify';
export {
  processWebhookEvents,
  initWebhookHandler,
  type XeroWebhookEvent,
  type XeroWebhookPayload,
  type WebhookHandlerDeps,
} from './services/webhookHandler';

// Sync services (for event-driven triggering)
export { syncContact, bulkSyncContacts } from './services/contactSync';
export { createInvoice, voidInvoice, adjustInvoice, bulkSyncInvoices } from './services/invoiceSync';
export { recordPayment } from './services/paymentSync';
export { createCreditNote } from './services/creditNoteSync';
export { runReconciliation } from './services/reconciliation';
