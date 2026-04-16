import type { Model } from 'mongoose';
import type { Redis } from 'ioredis';
import type { IXeroSyncLogDocument, IXeroConfigDocument } from '../types';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Xero Webhook Event payload structure.
 * @see https://developer.xero.com/documentation/guides/webhooks/overview
 */
export interface XeroWebhookEvent {
  resourceUrl: string;
  resourceId: string;
  eventDateUtc: string;
  eventType: 'Create' | 'Update' | 'Delete';
  eventCategory:
    | 'CONTACT'
    | 'INVOICE'
    | 'PAYMENT'
    | 'CREDIT_NOTE'
    | 'ACCOUNT'
    | 'MANUAL_JOURNAL'
    | 'BANK_TRANSACTION';
  tenantId: string;
  tenantType: string;
}

export interface XeroWebhookPayload {
  events: XeroWebhookEvent[];
  firstEventSequence: number;
  lastEventSequence: number;
  entropy: string;
}

export interface WebhookHandlerDeps {
  XeroSyncLogModel: Model<IXeroSyncLogDocument>;
  XeroConfigModel: Model<IXeroConfigDocument>;
  // Mongoose Model<T> is invariant — `any` at DI boundary lets consumers
  // pass Model<ISpecificDoc> without `as never`. Webhook handler only uses
  // structural methods on these models.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  UserModel: Model<any>;
  OrderModel: Model<any>;
  PaymentModel: Model<any>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  redisClient: Redis;
  auditLog: import('@nugen/audit-log').AuditLogDI;
}

// ─── Module State ───────────────────────────────────────────────────────────

let deps: WebhookHandlerDeps | null = null;

export function initWebhookHandler(d: WebhookHandlerDeps): void {
  deps = d;
}

// ─── Idempotency ────────────────────────────────────────────────────────────

/**
 * Deduplicate webhook events using Redis SET with TTL.
 * Xero may send the same event multiple times; we store processed event keys for 24h.
 */
async function isEventProcessed(
  tenantId: string,
  resourceId: string,
  eventType: string,
): Promise<boolean> {
  if (!deps) {
    return false;
  }
  const key = `xero:webhook:processed:${tenantId}:${resourceId}:${eventType}`;
  const exists = await deps.redisClient.get(key);
  return exists !== null;
}

async function markEventProcessed(
  tenantId: string,
  resourceId: string,
  eventType: string,
): Promise<void> {
  if (!deps) {
    return;
  }
  const key = `xero:webhook:processed:${tenantId}:${resourceId}:${eventType}`;
  await deps.redisClient.set(key, '1', 'EX', 86400); // 24h TTL
}

// ─── Event Handlers ─────────────────────────────────────────────────────────

async function handleContactEvent(event: XeroWebhookEvent): Promise<void> {
  if (!deps) {
    return;
  }

  // Log the inbound Xero contact change — downstream sync can pick it up
  await deps.XeroSyncLogModel.create({
    entityType: 'contact',
    entityId: event.resourceId,
    xeroEntityId: event.resourceId,
    action: event.eventType === 'Create' ? 'create' : 'update',
    status: 'queued',
    requestPayload: {
      source: 'xero_webhook',
      resourceUrl: event.resourceUrl,
      eventDateUtc: event.eventDateUtc,
    },
    retryCount: 0,
  });
}

async function handleInvoiceEvent(event: XeroWebhookEvent): Promise<void> {
  if (!deps) {
    return;
  }

  // Find matching local order by xeroInvoiceId
  const order = await deps.OrderModel.findOne({ xeroInvoiceId: event.resourceId }).lean();

  await deps.XeroSyncLogModel.create({
    entityType: 'invoice',
    entityId: order ? (order as unknown as { _id: string })._id : event.resourceId,
    xeroEntityId: event.resourceId,
    action: event.eventType === 'Delete' ? 'void' : 'update',
    status: 'queued',
    requestPayload: {
      source: 'xero_webhook',
      resourceUrl: event.resourceUrl,
      eventDateUtc: event.eventDateUtc,
      hasLocalOrder: !!order,
    },
    retryCount: 0,
  });
}

async function handlePaymentEvent(event: XeroWebhookEvent): Promise<void> {
  if (!deps) {
    return;
  }

  await deps.XeroSyncLogModel.create({
    entityType: 'payment',
    entityId: event.resourceId,
    xeroEntityId: event.resourceId,
    action: event.eventType === 'Create' ? 'create' : 'update',
    status: 'queued',
    requestPayload: {
      source: 'xero_webhook',
      resourceUrl: event.resourceUrl,
      eventDateUtc: event.eventDateUtc,
    },
    retryCount: 0,
  });
}

// ─── Main Handler ───────────────────────────────────────────────────────────

/**
 * Process a batch of Xero webhook events.
 *
 * Key behaviors:
 * - Events are deduplicated via Redis (24h window)
 * - Tenant ID validated against stored config
 * - Each event creates a sync log entry for downstream processing
 * - Fires-and-forgets: Returns immediately to Xero, processes async
 * - Unknown event categories are logged but not processed (forward-compatible)
 */
export async function processWebhookEvents(payload: XeroWebhookPayload): Promise<{
  processed: number;
  skipped: number;
  errors: number;
}> {
  if (!deps) {
    throw new Error('Webhook handler not initialized — call initWebhookHandler() first');
  }

  const result = { processed: 0, skipped: 0, errors: 0 };

  // Validate tenant ID against stored config
  const config = await deps.XeroConfigModel.findOne().lean();
  if (!config?.xeroConnected) {
    // Xero not connected — still acknowledge events but skip processing
    result.skipped = payload.events.length;
    return result;
  }

  for (const event of payload.events) {
    try {
      // Tenant validation
      if (event.tenantId !== config.xeroTenantId) {
        result.skipped++;
        continue;
      }

      // Idempotency check
      const alreadyProcessed = await isEventProcessed(
        event.tenantId,
        event.resourceId,
        event.eventType,
      );
      if (alreadyProcessed) {
        result.skipped++;
        continue;
      }

      // Route to appropriate handler
      switch (event.eventCategory) {
        case 'CONTACT':
          await handleContactEvent(event);
          break;
        case 'INVOICE':
          await handleInvoiceEvent(event);
          break;
        case 'PAYMENT':
          await handlePaymentEvent(event);
          break;
        case 'CREDIT_NOTE':
          // Treat credit notes like invoice events for sync log
          await handleInvoiceEvent(event);
          break;
        default:
          // Forward-compatible: log unknown categories but don't fail
          console.warn(`[XERO-WEBHOOK] Unknown event category: ${event.eventCategory}`); // eslint-disable-line no-console
          result.skipped++;
          continue;
      }

      // Mark as processed for dedup
      await markEventProcessed(event.tenantId, event.resourceId, event.eventType);
      result.processed++;
    } catch (err: unknown) {
      console.error(`[XERO-WEBHOOK] Error processing event ${event.resourceId}:`, err); // eslint-disable-line no-console
      result.errors++;
    }
  }

  // Update last sync timestamp
  if (result.processed > 0) {
    await deps.XeroConfigModel.findOneAndUpdate({}, { $set: { lastSyncAt: new Date() } });
  }

  return result;
}
