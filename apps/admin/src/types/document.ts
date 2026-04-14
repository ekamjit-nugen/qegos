export type DocumentStatus = 'pending' | 'signed' | 'verified';

export const DOCUMENT_STATUS_COLORS: Record<DocumentStatus, string> = {
  pending: 'orange',
  signed: 'blue',
  verified: 'green',
};

export interface Document {
  _id: string;
  orderId: string;
  fileName: string;
  fileUrl?: string;
  documentType?: string;
  status: DocumentStatus;
  createdAt: string;
}

export interface DocumentListQuery {
  page?: number;
  limit?: number;
  orderId?: string;
  status?: DocumentStatus;
}

// ─── Vault Document Types ──────────────────────────────────────────────────

export interface VaultDocument {
  _id: string;
  userId: string;
  financialYear: string;
  category: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  description?: string;
  tags: string[];
  uploadedBy: 'client' | 'staff' | 'system';
  uploadedByUserId?: string;
  version: number;
  isArchived: boolean;
  archivedAt?: string;
  virusScanStatus?: string;
  contentHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultDocumentListQuery {
  page?: number;
  limit?: number;
  financialYear?: string;
  category?: string;
}

export interface StorageUsage {
  used: number;
  quota: number;
  breakdown: Array<{ financialYear: string; totalSize: number; count: number }>;
}

export const VAULT_CATEGORIES = [
  { value: 'payg_summary', label: 'PAYG Summary' },
  { value: 'interest_statement', label: 'Interest Statement' },
  { value: 'dividend_statement', label: 'Dividend Statement' },
  { value: 'managed_fund_statement', label: 'Managed Fund Statement' },
  { value: 'rental_income', label: 'Rental Income' },
  { value: 'self_employment', label: 'Self Employment' },
  { value: 'private_health_insurance', label: 'Private Health Insurance' },
  { value: 'donation_receipt', label: 'Donation Receipt' },
  { value: 'work_expense_receipt', label: 'Work Expense Receipt' },
  { value: 'self_education', label: 'Self Education' },
  { value: 'vehicle_logbook', label: 'Vehicle Logbook' },
  { value: 'home_office', label: 'Home Office' },
  { value: 'notice_of_assessment', label: 'Notice of Assessment' },
  { value: 'tax_return_copy', label: 'Tax Return Copy' },
  { value: 'bas_statement', label: 'BAS Statement' },
  { value: 'id_document', label: 'ID Document' },
  { value: 'superannuation_statement', label: 'Superannuation Statement' },
  { value: 'foreign_income', label: 'Foreign Income' },
  { value: 'capital_gains_record', label: 'Capital Gains Record' },
  { value: 'other', label: 'Other' },
] as const;

export const VAULT_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  VAULT_CATEGORIES.map((c) => [c.value, c.label]),
);
