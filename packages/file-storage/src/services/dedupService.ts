import { createHash } from 'crypto';
import type { Model, Types } from 'mongoose';
import type { IVaultDocumentDocument, DuplicateCheckResult } from '../types';

// ─── Module State ───────────────────────────────────────────────────────────

let VaultDocumentModel: Model<IVaultDocumentDocument>;

export function initDedupService(
  vaultDocModel: Model<IVaultDocumentDocument>,
): void {
  VaultDocumentModel = vaultDocModel;
}

// ─── Content Hash ───────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of file content for dedup detection.
 */
export function computeContentHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

// ─── Duplicate Check (STR-INV-02) ──────────────────────────────────────────

/**
 * Advisory duplicate detection. Returns warning, NOT blocking.
 * Checks same user + financial year + content hash.
 */
export async function checkDuplicate(
  userId: Types.ObjectId,
  financialYear: string,
  contentHash: string,
): Promise<DuplicateCheckResult> {
  const existing = await VaultDocumentModel.findOne({
    userId,
    financialYear,
    contentHash,
    isArchived: false,
  }).select('_id fileName createdAt').lean();

  if (!existing) {
    return { isDuplicate: false };
  }

  return {
    isDuplicate: true,
    existingFile: {
      id: existing._id as Types.ObjectId,
      fileName: existing.fileName,
      uploadedAt: existing.createdAt,
    },
  };
}
