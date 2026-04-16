import type { Model } from 'mongoose';
import type { IXeroSyncLogDocument, IXeroConfigDocument } from '../types';
import { RETRY_DELAYS_MS, MAX_RETRIES } from '../types';

// ─── Module State ───────────────────────────────────────────────────────────

let XeroSyncLogModel: Model<IXeroSyncLogDocument>;
let XeroConfigModel: Model<IXeroConfigDocument>;

// Sync executors registered by entity type
type SyncExecutor = (entityId: string) => Promise<void>;
const syncExecutors = new Map<string, SyncExecutor>();

export function initRetrySyncService(
  syncLogModel: Model<IXeroSyncLogDocument>,
  configModel: Model<IXeroConfigDocument>,
): void {
  XeroSyncLogModel = syncLogModel;
  XeroConfigModel = configModel;
}

export function registerSyncExecutor(entityType: string, executor: SyncExecutor): void {
  syncExecutors.set(entityType, executor);
}

// ─── Retry Failed Syncs (XRO-INV-05) ───────────────────────────────────

/**
 * XRO-INV-05: Retry failed syncs with exponential backoff.
 * Delays: 1min → 5min → 30min → 2hr. After 4 failures → permanent failed.
 */
export async function retryFailedSyncs(): Promise<number> {
  const now = new Date();

  const failedLogs = await XeroSyncLogModel.find({
    status: 'failed',
    retryCount: { $lt: MAX_RETRIES },
    nextRetryAt: { $lte: now },
  })
    .sort({ nextRetryAt: 1 })
    .limit(50);

  let retried = 0;

  for (const log of failedLogs) {
    const executor = syncExecutors.get(log.entityType);
    if (!executor) {
      continue;
    }

    try {
      log.status = 'processing';
      log.retryCount += 1;
      await log.save();

      await executor(log.entityId.toString());

      // If executor succeeded, it creates its own success log
      // Mark this retry log as superseded
      log.status = 'success';
      log.processedAt = new Date();
      await log.save();
      retried++;
    } catch (err: unknown) {
      log.status = 'failed';
      log.error = (err as Error).message;

      if (log.retryCount >= MAX_RETRIES) {
        // Permanent failure — no more retries
        log.nextRetryAt = undefined;
      } else {
        // Schedule next retry with exponential backoff
        const delayMs =
          RETRY_DELAYS_MS[log.retryCount - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
        log.nextRetryAt = new Date(Date.now() + delayMs);
      }

      await log.save();
    }
  }

  return retried;
}

// ─── Manual Retry (Admin) ───────────────────────────────────────────────

export async function retrySingleSync(syncLogId: string): Promise<boolean> {
  const log = await XeroSyncLogModel.findById(syncLogId);
  if (!log) {
    return false;
  }
  if (log.status !== 'failed') {
    return false;
  }

  const executor = syncExecutors.get(log.entityType);
  if (!executor) {
    return false;
  }

  try {
    log.status = 'processing';
    log.retryCount += 1;
    await log.save();

    await executor(log.entityId.toString());

    log.status = 'success';
    log.processedAt = new Date();
    await log.save();
    return true;
  } catch (err: unknown) {
    log.status = 'failed';
    log.error = (err as Error).message;
    await log.save();
    return false;
  }
}

// ─── Flush Offline Queue (XRO-INV-10) ──────────────────────────────────

/**
 * XRO-INV-10: When Xero reconnects, process all queued items.
 */
export async function flushOfflineQueue(): Promise<number> {
  // Check if Xero is connected
  const config = await XeroConfigModel.findOne().lean();
  if (!config?.xeroConnected) {
    return 0;
  }

  const queuedLogs = await XeroSyncLogModel.find({ status: 'queued' })
    .sort({ createdAt: 1 })
    .limit(100);

  let flushed = 0;

  for (const log of queuedLogs) {
    const executor = syncExecutors.get(log.entityType);
    if (!executor) {
      continue;
    }

    try {
      log.status = 'processing';
      await log.save();

      await executor(log.entityId.toString());

      log.status = 'success';
      log.processedAt = new Date();
      await log.save();
      flushed++;
    } catch (err: unknown) {
      log.status = 'failed';
      log.error = (err as Error).message;
      log.retryCount += 1;

      if (log.retryCount < MAX_RETRIES) {
        const delayMs =
          RETRY_DELAYS_MS[log.retryCount - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
        log.nextRetryAt = new Date(Date.now() + delayMs);
      }

      await log.save();
    }
  }

  return flushed;
}
