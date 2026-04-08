import { randomUUID } from 'crypto';
import type { Model, Types } from 'mongoose';
import type {
  IVaultDocumentDocument,
  ITaxYearSummaryDocument,
  VaultDocumentCategory,
  VirusScanStatus,
  PrefillResponse,
  YoYComparison,
  AtoRefundStatus,
} from '@nugen/file-storage';
import {
  buildS3Key,
  uploadToS3,
  quarantineFile,
  deleteFromS3,
  getPresignedUrl,
  scanBuffer,
  checkQuota,
  incrementUsage,
  decrementUsage,
  getUsage,
  computeContentHash,
  checkDuplicate,
} from '@nugen/file-storage';
import type { StorageUsage, DuplicateCheckResult } from '@nugen/file-storage';
import { AppError } from '@nugen/error-handler';

// ─── Module State ───────────────────────────────────────────────────────────

let VaultDocumentModel: Model<IVaultDocumentDocument>;
let TaxYearSummaryModel: Model<ITaxYearSummaryDocument>;

export function initPortalService(
  vaultModel: Model<IVaultDocumentDocument>,
  taxSummaryModel: Model<ITaxYearSummaryDocument>,
): void {
  VaultDocumentModel = vaultModel;
  TaxYearSummaryModel = taxSummaryModel;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VAULT OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Upload (CPV-INV-01, 02, 04, 06, 07) ───────────────────────────────────

export interface UploadParams {
  userId: Types.ObjectId;
  financialYear: string;
  category: VaultDocumentCategory;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  uploadedBy: 'client' | 'staff' | 'system';
  uploadedByUserId?: Types.ObjectId;
  description?: string;
  tags?: string[];
}

export interface UploadDocumentResult {
  document: IVaultDocumentDocument;
  duplicateWarning?: DuplicateCheckResult;
}

export async function uploadDocument(params: UploadParams): Promise<UploadDocumentResult> {
  const {
    userId, financialYear, category, fileName, mimeType,
    buffer, uploadedBy, uploadedByUserId, description, tags,
  } = params;

  // CPV-INV-06: Quota check BEFORE upload
  const hasQuota = await checkQuota(userId, buffer.length);
  if (!hasQuota) {
    throw new AppError({
      statusCode: 413,
      code: 'STORAGE_EXCEEDED',
      message: 'Storage quota exceeded',
    });
  }

  // CPV-INV-01: Virus scan BEFORE S3 storage
  const scanResult: VirusScanStatus = await scanBuffer(buffer);
  if (scanResult === 'infected') {
    // Quarantine the file
    const uuid = randomUUID();
    const key = buildS3Key(userId.toString(), financialYear, uuid, fileName);
    await quarantineFile(buffer, key, mimeType);

    throw new AppError({
      statusCode: 422,
      code: 'VIRUS_DETECTED',
      message: 'File could not be uploaded. Please scan your device and try again.',
    });
  }

  if (scanResult === 'error') {
    throw AppError.serviceUnavailable('Virus scan failed. Please try again later.');
  }

  // Content hash for dedup
  const contentHash = computeContentHash(buffer);

  // STR-INV-02: Advisory duplicate check
  const dupCheck = await checkDuplicate(userId, financialYear, contentHash);

  // CPV-INV-07: Version management — check for existing doc in same category+FY
  let version = 1;
  let previousVersionId: Types.ObjectId | undefined;

  const existing = await VaultDocumentModel.findOne({
    userId,
    financialYear,
    category,
    isArchived: false,
  }).sort({ version: -1 }).select('_id version');

  if (existing) {
    version = (existing.version ?? 1) + 1;
    previousVersionId = existing._id as Types.ObjectId;
  }

  // CPV-INV-02: Upload to S3 with structured path
  const uuid = randomUUID();
  const s3Key = buildS3Key(userId.toString(), financialYear, uuid, fileName);
  await uploadToS3(buffer, s3Key, mimeType);

  // STR-INV-01: Atomically increment storage usage
  await incrementUsage(userId, buffer.length);

  // Create vault document record
  const doc = await VaultDocumentModel.create({
    userId,
    financialYear,
    category,
    fileName,
    fileUrl: s3Key,
    fileSize: buffer.length,
    mimeType,
    description,
    uploadedBy,
    uploadedByUserId,
    version,
    previousVersionId,
    virusScanStatus: scanResult,
    virusScanAt: new Date(),
    contentHash,
    tags,
  });

  return {
    document: doc,
    duplicateWarning: dupCheck.isDuplicate ? dupCheck : undefined,
  };
}

// ─── List Documents ─────────────────────────────────────────────────────────

export interface ListDocumentsParams {
  userId: Types.ObjectId;
  financialYear?: string;
  category?: VaultDocumentCategory;
  page?: number;
  limit?: number;
}

export async function listDocuments(
  params: ListDocumentsParams,
): Promise<{ documents: IVaultDocumentDocument[]; total: number; page: number; pages: number }> {
  const { userId, financialYear, category, page = 1, limit = 20 } = params;

  const query: Record<string, unknown> = { userId, isArchived: false };
  if (financialYear) query.financialYear = financialYear;
  if (category) query.category = category;

  const [documents, total] = await Promise.all([
    VaultDocumentModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    VaultDocumentModel.countDocuments(query),
  ]);

  return {
    documents,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

// ─── Get Document + Presigned URL (CPV-INV-03) ─────────────────────────────

export async function getDocument(
  docId: Types.ObjectId,
  userId: Types.ObjectId,
): Promise<{ document: IVaultDocumentDocument; downloadUrl: string } | null> {
  const doc = await VaultDocumentModel.findOne({
    _id: docId,
    isArchived: false,
  });

  if (!doc) return null;

  // CPV-INV-03: Presigned URL generated on-demand, 15min expiry
  const downloadUrl = await getPresignedUrl(doc.fileUrl);

  return { document: doc, downloadUrl };
}

// ─── Update Document Metadata ───────────────────────────────────────────────

export async function updateDocument(
  docId: Types.ObjectId,
  userId: Types.ObjectId,
  updates: { category?: VaultDocumentCategory; description?: string; tags?: string[] },
): Promise<IVaultDocumentDocument | null> {
  return VaultDocumentModel.findOneAndUpdate(
    { _id: docId, userId, isArchived: false },
    { $set: updates },
    { new: true },
  );
}

// ─── Soft Delete (CPV-INV-05) ───────────────────────────────────────────────

export async function archiveDocument(
  docId: Types.ObjectId,
  userId: Types.ObjectId,
): Promise<IVaultDocumentDocument | null> {
  return VaultDocumentModel.findOneAndUpdate(
    { _id: docId, userId, isArchived: false },
    { $set: { isArchived: true, archivedAt: new Date() } },
    { new: true },
  );
}

// ─── Restore Archived Document ─────────────────────────────────────────────

export async function restoreDocument(
  docId: Types.ObjectId,
  userId: Types.ObjectId,
): Promise<IVaultDocumentDocument | null> {
  return VaultDocumentModel.findOneAndUpdate(
    { _id: docId, userId, isArchived: true },
    { $set: { isArchived: false }, $unset: { archivedAt: 1 } },
    { new: true },
  );
}

// ─── Hard Delete Cron (CPV-INV-05 + STR-INV-04) ────────────────────────────

/**
 * Delete documents archived more than 30 days ago.
 * S3 delete first, then counter decrement (STR-INV-04).
 */
export async function hardDeleteExpiredDocuments(): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const expired = await VaultDocumentModel.find({
    isArchived: true,
    archivedAt: { $lte: thirtyDaysAgo },
  });

  let deleted = 0;
  for (const doc of expired) {
    try {
      // STR-INV-04: S3 first, then counter
      await deleteFromS3(doc.fileUrl);
      await decrementUsage(doc.userId, doc.fileSize);
      await VaultDocumentModel.deleteOne({ _id: doc._id });
      deleted++;
    } catch {
      // S3 fail = skip, don't decrement. Will retry next cron run.
    }
  }

  return deleted;
}

// ─── List Financial Years with Doc Counts ───────────────────────────────────

export async function listFinancialYears(
  userId: Types.ObjectId,
): Promise<Array<{ year: string; count: number }>> {
  return VaultDocumentModel.aggregate([
    { $match: { userId, isArchived: false } },
    { $group: { _id: '$financialYear', count: { $sum: 1 } } },
    { $project: { _id: 0, year: '$_id', count: 1 } },
    { $sort: { year: -1 } },
  ]);
}

// ─── Storage Usage ──────────────────────────────────────────────────────────

export async function getStorageUsage(userId: Types.ObjectId): Promise<StorageUsage> {
  return getUsage(userId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAX YEAR SUMMARIES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Create/Update (CPV-INV-09: system-only for financials) ─────────────────

export async function upsertTaxSummary(
  data: Record<string, unknown>,
): Promise<ITaxYearSummaryDocument> {
  const { userId, financialYear, ...rest } = data;

  const summary = await TaxYearSummaryModel.findOneAndUpdate(
    { userId, financialYear },
    { $set: { userId, financialYear, ...rest } },
    { upsert: true, new: true },
  );

  return summary;
}

// ─── List Summaries for User ────────────────────────────────────────────────

export async function listTaxSummaries(
  userId: Types.ObjectId,
): Promise<ITaxYearSummaryDocument[]> {
  return TaxYearSummaryModel.find({ userId }).sort({ financialYear: -1 });
}

// ─── YoY Comparison ─────────────────────────────────────────────────────────

function getPreviousFY(fy: string): string {
  // "2024-25" → "2023-24"
  const [startStr] = fy.split('-');
  const start = parseInt(startStr, 10);
  const prevStart = start - 1;
  const prevEnd = start;
  return `${prevStart}-${String(prevEnd).slice(-2)}`;
}

export async function getYoYComparison(
  userId: Types.ObjectId,
  financialYear: string,
): Promise<YoYComparison | null> {
  const previousFY = getPreviousFY(financialYear);

  const [current, previous] = await Promise.all([
    TaxYearSummaryModel.findOne({ userId, financialYear }).lean(),
    TaxYearSummaryModel.findOne({ userId, financialYear: previousFY }).lean(),
  ]);

  if (!current) return null;

  const compareFields = [
    'totalIncome', 'totalDeductions', 'taxableIncome',
    'medicareLevyAmount', 'totalTaxPayable', 'taxWithheld', 'refundOrOwing',
  ];

  const changes: Record<string, { current: number; previous: number; delta: number; percentChange: number }> = {};

  for (const field of compareFields) {
    const curr = (current as Record<string, unknown>)[field] as number ?? 0;
    const prev = previous ? ((previous as Record<string, unknown>)[field] as number ?? 0) : 0;
    const delta = curr - prev;
    const percentChange = prev !== 0 ? Math.round((delta / Math.abs(prev)) * 10000) / 100 : 0;

    changes[field] = { current: curr, previous: prev, delta, percentChange };
  }

  return {
    current: current as unknown as import('@nugen/file-storage').ITaxYearSummary,
    previous: previous as unknown as import('@nugen/file-storage').ITaxYearSummary | null,
    changes,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ATO STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export async function getAtoStatus(
  userId: Types.ObjectId,
  financialYear: string,
): Promise<ITaxYearSummaryDocument | null> {
  return TaxYearSummaryModel.findOne({ userId, financialYear })
    .select('atoRefundStatus assessmentDate noaReceived atoRefundIssuedDate filingDate financialYear');
}

export async function updateAtoStatus(
  userId: Types.ObjectId,
  financialYear: string,
  updates: {
    atoRefundStatus: AtoRefundStatus;
    assessmentDate?: Date;
    noaReceived?: boolean;
    atoRefundIssuedDate?: Date;
  },
): Promise<ITaxYearSummaryDocument | null> {
  return TaxYearSummaryModel.findOneAndUpdate(
    { userId, financialYear },
    { $set: updates },
    { new: true },
  );
}

export async function bulkUpdateAtoStatus(
  updates: Array<{
    userId: Types.ObjectId;
    financialYear: string;
    atoRefundStatus: AtoRefundStatus;
    assessmentDate?: Date;
    noaReceived?: boolean;
    atoRefundIssuedDate?: Date;
  }>,
): Promise<number> {
  const ops = updates.map((u) => ({
    updateOne: {
      filter: { userId: u.userId, financialYear: u.financialYear },
      update: {
        $set: {
          atoRefundStatus: u.atoRefundStatus,
          ...(u.assessmentDate && { assessmentDate: u.assessmentDate }),
          ...(u.noaReceived !== undefined && { noaReceived: u.noaReceived }),
          ...(u.atoRefundIssuedDate && { atoRefundIssuedDate: u.atoRefundIssuedDate }),
        },
      },
    },
  }));

  const result = await TaxYearSummaryModel.bulkWrite(ops);
  return result.modifiedCount;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PREFILL (CPV-INV-10)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns prior-year data as suggested values. Advisory only.
 */
export async function getPrefillData(
  userId: Types.ObjectId,
  financialYear: string,
): Promise<PrefillResponse | null> {
  const previousFY = getPreviousFY(financialYear);

  const previousSummary = await TaxYearSummaryModel.findOne({
    userId,
    financialYear: previousFY,
  }).lean();

  if (!previousSummary) return null;

  // Get prior-year vault documents for reference
  const priorDocs = await VaultDocumentModel.find({
    userId,
    financialYear: previousFY,
    isArchived: false,
  }).select('category fileName').lean();

  return {
    suggested: {
      totalIncome: previousSummary.totalIncome,
      totalDeductions: previousSummary.totalDeductions,
      taxableIncome: previousSummary.taxableIncome,
      medicareLevyAmount: previousSummary.medicareLevyAmount,
      superannuationReported: previousSummary.superannuationReported,
      servicesUsed: previousSummary.servicesUsed,
      priorDocuments: priorDocs.map((d) => ({
        category: d.category,
        fileName: d.fileName,
      })),
    },
    source: `FY${previousFY}`,
  };
}
