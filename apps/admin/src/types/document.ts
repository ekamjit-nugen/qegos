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
