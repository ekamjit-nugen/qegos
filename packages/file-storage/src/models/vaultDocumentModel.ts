import { Schema, type Connection, type Model } from 'mongoose';
import type { IVaultDocumentDocument, VirusScanStatus, OcrStatus, UploadedBy } from '../types';
import { VAULT_DOCUMENT_CATEGORIES } from '../types';

const vaultDocumentSchema = new Schema<IVaultDocumentDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    financialYear: { type: String, required: true },
    category: {
      type: String,
      required: true,
      enum: VAULT_DOCUMENT_CATEGORIES,
    },
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true },
    description: { type: String },
    uploadedBy: {
      type: String,
      required: true,
      enum: ['client', 'staff', 'system'] as UploadedBy[],
    },
    uploadedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1, min: 1 },
    previousVersionId: { type: Schema.Types.ObjectId, ref: 'VaultDocument' },
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date },
    ocrExtracted: {
      type: new Schema(
        {
          employerName: String,
          grossIncome: Number,
          taxWithheld: Number,
          netIncome: Number,
          abnNumber: String,
          dateRange: String,
        },
        { _id: false },
      ),
    },
    ocrStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'not_applicable'] as OcrStatus[],
    },
    virusScanStatus: {
      type: String,
      required: true,
      enum: ['pending', 'clean', 'infected', 'error'] as VirusScanStatus[],
      default: 'pending',
    },
    virusScanAt: { type: Date },
    contentHash: { type: String, index: true },
    tags: [{ type: String }],
  },
  {
    timestamps: true,
    collection: 'vault_documents',
  },
);

// ─── Indexes ────────────────────────────────────────────────────────────────

// Primary lookup: user's documents by year
vaultDocumentSchema.index({ userId: 1, financialYear: 1 });

// Category browsing
vaultDocumentSchema.index({ userId: 1, category: 1 });

// Dedup check: same user + year + hash
vaultDocumentSchema.index({ userId: 1, financialYear: 1, contentHash: 1 });

// Versioning: find previous versions
vaultDocumentSchema.index({ previousVersionId: 1 });

// Soft-delete cleanup cron
vaultDocumentSchema.index({ isArchived: 1, archivedAt: 1 });

// ─── Factory ────────────────────────────────────────────────────────────────

export function createVaultDocumentModel(
  connection: Connection,
): Model<IVaultDocumentDocument> {
  if (connection.models.VaultDocument) {
    return connection.models.VaultDocument as Model<IVaultDocumentDocument>;
  }
  return connection.model<IVaultDocumentDocument>('VaultDocument', vaultDocumentSchema);
}
