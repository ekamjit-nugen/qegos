import type { Document, Types } from 'mongoose';

// ─── Configuration ──────────────────────────────────────────────────────────

export interface FileStorageConfig {
  /** S3 bucket for clean files */
  s3Bucket: string;
  /** S3 bucket for quarantined (infected) files */
  s3QuarantineBucket: string;
  /** AWS region */
  s3Region: string;
  /** AWS access key */
  s3AccessKeyId: string;
  /** AWS secret key */
  s3SecretAccessKey: string;
  /** Presigned URL expiry in seconds (default 900 = 15min) */
  presignedUrlExpiry?: number;
  /** Max file size in bytes (default 20MB = 20_971_520) */
  maxFileSize?: number;
  /** Default storage quota in bytes (default 500MB = 524_288_000) */
  defaultStorageQuota?: number;
  /** ClamAV host for virus scanning */
  clamavHost?: string;
  /** ClamAV port (default 3310) */
  clamavPort?: number;
}

// ─── Enums / Unions ─────────────────────────────────────────────────────────

export type VaultDocumentCategory =
  | 'payg_summary'
  | 'interest_statement'
  | 'dividend_statement'
  | 'managed_fund_statement'
  | 'rental_income'
  | 'self_employment'
  | 'private_health_insurance'
  | 'donation_receipt'
  | 'work_expense_receipt'
  | 'self_education'
  | 'vehicle_logbook'
  | 'home_office'
  | 'notice_of_assessment'
  | 'tax_return_copy'
  | 'bas_statement'
  | 'id_document'
  | 'superannuation_statement'
  | 'foreign_income'
  | 'capital_gains_record'
  | 'other';

export const VAULT_DOCUMENT_CATEGORIES: VaultDocumentCategory[] = [
  'payg_summary', 'interest_statement', 'dividend_statement',
  'managed_fund_statement', 'rental_income', 'self_employment',
  'private_health_insurance', 'donation_receipt', 'work_expense_receipt',
  'self_education', 'vehicle_logbook', 'home_office',
  'notice_of_assessment', 'tax_return_copy', 'bas_statement',
  'id_document', 'superannuation_statement', 'foreign_income',
  'capital_gains_record', 'other',
];

export type VirusScanStatus = 'pending' | 'clean' | 'infected' | 'error';

export type OcrStatus = 'pending' | 'completed' | 'failed' | 'not_applicable';

export type UploadedBy = 'client' | 'staff' | 'system';

export type AtoRefundStatus =
  | 'not_filed'
  | 'filed'
  | 'processing'
  | 'assessed'
  | 'refund_issued'
  | 'payment_due';

export const ATO_REFUND_STATUSES: AtoRefundStatus[] = [
  'not_filed', 'filed', 'processing', 'assessed', 'refund_issued', 'payment_due',
];

// ─── Allowed MIME types (CPV-INV-04) ────────────────────────────────────────

export const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/tiff': 'tiff',
};

export const MAX_FILE_SIZE = 20_971_520; // 20MB

export const DEFAULT_STORAGE_QUOTA = 524_288_000; // 500MB

export const PRESIGNED_URL_EXPIRY = 900; // 15 minutes

// ─── OCR Extracted Data ─────────────────────────────────────────────────────

export interface OcrExtractedData {
  employerName?: string;
  grossIncome?: number;
  taxWithheld?: number;
  netIncome?: number;
  abnNumber?: string;
  dateRange?: string;
}

// ─── Vault Document Interface ───────────────────────────────────────────────

export interface IVaultDocument {
  userId: Types.ObjectId;
  financialYear: string;
  category: VaultDocumentCategory;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  description?: string;
  uploadedBy: UploadedBy;
  uploadedByUserId?: Types.ObjectId;
  version: number;
  previousVersionId?: Types.ObjectId;
  isArchived: boolean;
  archivedAt?: Date;
  ocrExtracted?: OcrExtractedData;
  ocrStatus?: OcrStatus;
  virusScanStatus: VirusScanStatus;
  virusScanAt?: Date;
  contentHash?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IVaultDocumentDocument extends IVaultDocument, Document {}

// ─── Tax Year Summary Interface ─────────────────────────────────────────────

export interface ITaxYearSummary {
  userId: Types.ObjectId;
  financialYear: string;
  orderId?: Types.ObjectId;
  totalIncome: number;
  totalDeductions: number;
  taxableIncome: number;
  medicareLevyAmount: number;
  hecsRepayment: number;
  totalTaxPayable: number;
  taxWithheld: number;
  refundOrOwing: number;
  superannuationReported: number;
  filingDate?: Date;
  assessmentDate?: Date;
  noaReceived: boolean;
  atoRefundStatus: AtoRefundStatus;
  atoRefundIssuedDate?: Date;
  servicesUsed?: string[];
  totalPaidToQegos: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITaxYearSummaryDocument extends ITaxYearSummary, Document {}

// ─── Service Interfaces ─────────────────────────────────────────────────────

export interface UploadResult {
  fileUrl: string;
  contentHash: string;
  virusScanStatus: VirusScanStatus;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingFile?: {
    id: Types.ObjectId;
    fileName: string;
    uploadedAt: Date;
  };
}

export interface StorageUsage {
  used: number;
  quota: number;
  breakdown: Array<{ year: string; size: number }>;
}

export interface PrefillResponse {
  suggested: Record<string, unknown>;
  source: string;
}

export interface YoYComparison {
  current: ITaxYearSummary;
  previous: ITaxYearSummary | null;
  changes: Record<string, { current: number; previous: number; delta: number; percentChange: number }>;
}

// ─── Route Dependencies ─────────────────────────────────────────────────────

export interface FileStorageRouteDeps {
  VaultDocumentModel: import('mongoose').Model<IVaultDocumentDocument>;
  TaxYearSummaryModel: import('mongoose').Model<ITaxYearSummaryDocument>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mongoose Model<T> invariance; app passes Model<IUserDocument>
  UserModel: import('mongoose').Model<any>;
  authenticate: import('express').RequestHandler;
  checkPermission: import('@nugen/rbac').CheckPermissionFn;
  auditLog: import('@nugen/audit-log').AuditLogDI;
  s3Service: {
    upload: (buffer: Buffer, key: string, mimeType: string) => Promise<string>;
    delete: (key: string) => Promise<void>;
    getPresignedUrl: (key: string) => Promise<string>;
  };
  virusScanService: {
    scan: (buffer: Buffer) => Promise<VirusScanStatus>;
  };
  storageQuotaService: {
    checkQuota: (userId: Types.ObjectId, fileSize: number) => Promise<boolean>;
    incrementUsage: (userId: Types.ObjectId, fileSize: number) => Promise<void>;
    decrementUsage: (userId: Types.ObjectId, fileSize: number) => Promise<void>;
    getUsage: (userId: Types.ObjectId) => Promise<StorageUsage>;
  };
  dedupService: {
    check: (userId: Types.ObjectId, financialYear: string, contentHash: string) => Promise<DuplicateCheckResult>;
  };
  config: FileStorageConfig;
}
