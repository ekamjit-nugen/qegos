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
  version: number;
  isArchived: boolean;
  createdAt: string;
}

export interface VaultYear {
  year: string;
  count: number;
}

export interface StorageUsage {
  used: number;
  limit: number;
  percentage: number;
  documents: number;
}

export interface VaultDocumentListQuery {
  page?: number;
  limit?: number;
  financialYear?: string;
  category?: string;
}
