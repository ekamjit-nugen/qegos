import type { Connection, Model, Document } from 'mongoose';
import type { FileStorageConfig, IVaultDocumentDocument, ITaxYearSummaryDocument } from './types';
import { createVaultDocumentModel } from './models/vaultDocumentModel';
import { createTaxYearSummaryModel } from './models/taxYearSummaryModel';
import { initS3Service } from './services/s3Service';
import { initVirusScanService } from './services/virusScanService';
import { initStorageQuotaService } from './services/storageQuotaService';
import { initDedupService } from './services/dedupService';

// ─── Init Result ────────────────────────────────────────────────────────────

export interface FileStorageInitResult {
  VaultDocumentModel: Model<IVaultDocumentDocument>;
  TaxYearSummaryModel: Model<ITaxYearSummaryDocument>;
}

// ─── Init ───────────────────────────────────────────────────────────────────

/**
 * Initialize @nugen/file-storage package.
 * Creates models, configures S3 client, virus scanner, quota, and dedup services.
 */
export function init(
  connection: Connection,
  config: FileStorageConfig,
  externalModels: {
    UserModel: Model<Document>;
  },
): FileStorageInitResult {
  // Create models
  const VaultDocumentModel = createVaultDocumentModel(connection);
  const TaxYearSummaryModel = createTaxYearSummaryModel(connection);

  // Initialize services
  initS3Service(config);
  initVirusScanService(config);
  initStorageQuotaService(externalModels.UserModel, VaultDocumentModel, config.defaultStorageQuota);
  initDedupService(VaultDocumentModel);

  return {
    VaultDocumentModel,
    TaxYearSummaryModel,
  };
}

// ─── Re-exports ─────────────────────────────────────────────────────────────

// Types
export type {
  FileStorageConfig,
  IVaultDocument,
  IVaultDocumentDocument,
  ITaxYearSummary,
  ITaxYearSummaryDocument,
  VaultDocumentCategory,
  VirusScanStatus,
  OcrStatus,
  UploadedBy,
  AtoRefundStatus,
  UploadResult,
  DuplicateCheckResult,
  StorageUsage,
  PrefillResponse,
  YoYComparison,
  OcrExtractedData,
  FileStorageRouteDeps,
} from './types';

export {
  VAULT_DOCUMENT_CATEGORIES,
  ATO_REFUND_STATUSES,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  DEFAULT_STORAGE_QUOTA,
  PRESIGNED_URL_EXPIRY,
} from './types';

// Models
export { createVaultDocumentModel } from './models/vaultDocumentModel';
export { createTaxYearSummaryModel } from './models/taxYearSummaryModel';

// Services
export {
  initS3Service,
  buildS3Key,
  uploadToS3,
  quarantineFile,
  deleteFromS3,
  getPresignedUrl,
} from './services/s3Service';

export {
  initVirusScanService,
  scanBuffer,
} from './services/virusScanService';

export {
  initStorageQuotaService,
  checkQuota,
  incrementUsage,
  decrementUsage,
  getUsage,
  reconcileStorageUsage,
} from './services/storageQuotaService';

export {
  initDedupService,
  computeContentHash,
  checkDuplicate,
} from './services/dedupService';

// Validators
export {
  uploadDocumentValidation,
  updateDocumentValidation,
  getDocumentValidation,
  deleteDocumentValidation,
  listDocumentsValidation,
  listYearsValidation,
  storageUsageValidation,
  prefillValidation,
  createTaxSummaryValidation,
  listTaxSummariesValidation,
  yoyComparisonValidation,
  getAtoStatusValidation,
  updateAtoStatusValidation,
  bulkUpdateAtoStatusValidation,
} from './validators/fileValidators';
