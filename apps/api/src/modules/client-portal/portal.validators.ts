/**
 * Re-export validators from @nugen/file-storage for route wiring.
 * Tier 2 module consumes Tier 1 validators.
 */
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
} from '@nugen/file-storage';
