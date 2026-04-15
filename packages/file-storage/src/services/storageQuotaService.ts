import type { Model, Types } from 'mongoose';
import type { IVaultDocumentDocument, StorageUsage } from '../types';
import { DEFAULT_STORAGE_QUOTA } from '../types';

// ─── Module State ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Model<T> invariant; `any` at DI boundary.
let UserModel: Model<any>;
let VaultDocumentModel: Model<IVaultDocumentDocument>;
let defaultQuota: number;

export function initStorageQuotaService(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userModel: Model<any>,
  vaultDocModel: Model<IVaultDocumentDocument>,
  quota?: number,
): void {
  UserModel = userModel;
  VaultDocumentModel = vaultDocModel;
  defaultQuota = quota ?? DEFAULT_STORAGE_QUOTA;
}

// ─── Quota Check (CPV-INV-06) ───────────────────────────────────────────────

/**
 * Check if user has enough quota BEFORE upload.
 * Returns true if upload is allowed, false if quota exceeded.
 */
export async function checkQuota(
  userId: Types.ObjectId,
  fileSize: number,
): Promise<boolean> {
  const user = await UserModel.findById(userId).select('storageUsed storageQuota').lean();
  if (!user) return false;

  const obj = user as unknown as { storageUsed?: number; storageQuota?: number };
  const used = obj.storageUsed ?? 0;
  const quota = obj.storageQuota ?? defaultQuota;

  return (used + fileSize) <= quota;
}

/**
 * Atomically increment storage usage after successful upload (STR-INV-01).
 */
export async function incrementUsage(
  userId: Types.ObjectId,
  fileSize: number,
): Promise<void> {
  await UserModel.updateOne(
    { _id: userId },
    { $inc: { storageUsed: fileSize } },
  );
}

/**
 * Atomically decrement storage usage after confirmed S3 deletion (STR-INV-04).
 */
export async function decrementUsage(
  userId: Types.ObjectId,
  fileSize: number,
): Promise<void> {
  await UserModel.updateOne(
    { _id: userId },
    { $inc: { storageUsed: -fileSize } },
  );
}

// ─── Storage Usage ──────────────────────────────────────────────────────────

/**
 * Get user's storage usage with per-year breakdown.
 */
export async function getUsage(userId: Types.ObjectId): Promise<StorageUsage> {
  const user = await UserModel.findById(userId).select('storageUsed storageQuota').lean();
  const obj = user as unknown as { storageUsed?: number; storageQuota?: number } | null;

  const used = obj?.storageUsed ?? 0;
  const quota = obj?.storageQuota ?? defaultQuota;

  // Per-year breakdown via aggregation
  const breakdown = await VaultDocumentModel.aggregate<{ year: string; size: number }>([
    { $match: { userId, isArchived: false } },
    { $group: { _id: '$financialYear', size: { $sum: '$fileSize' } } },
    { $project: { _id: 0, year: '$_id', size: 1 } },
    { $sort: { year: -1 } },
  ]);

  return { used, quota, breakdown };
}

// ─── Monthly Reconciliation (STR-INV-01) ────────────────────────────────────

/**
 * Reconcile storageUsed vs actual sum of vault document sizes.
 * Auto-corrects drift > 1MB. Returns number of users corrected.
 */
export async function reconcileStorageUsage(): Promise<number> {
  const actuals = await VaultDocumentModel.aggregate<{
    _id: Types.ObjectId;
    actualSize: number;
  }>([
    { $match: { isArchived: false } },
    { $group: { _id: '$userId', actualSize: { $sum: '$fileSize' } } },
  ]);

  let corrected = 0;
  const DRIFT_THRESHOLD = 1_048_576; // 1MB

  for (const entry of actuals) {
    const user = await UserModel.findById(entry._id).select('storageUsed').lean();
    const obj = user as unknown as { storageUsed?: number } | null;
    const recorded = obj?.storageUsed ?? 0;
    const drift = Math.abs(recorded - entry.actualSize);

    if (drift > DRIFT_THRESHOLD) {
      await UserModel.updateOne(
        { _id: entry._id },
        { $set: { storageUsed: entry.actualSize } },
      );
      corrected++;
    }
  }

  return corrected;
}
