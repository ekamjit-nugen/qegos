import type { Model, Document, Types } from 'mongoose';
import type { Request, RequestHandler } from 'express';

// ─── Zoho Sign Configuration ───────────────────────────────────────────────

export interface ZohoSignConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  webhookSecret: string;
  baseUrl: string;
}

// ─── Document Status (matches Order.documents[].status enum) ───────────────

export type DocumentStatus = 'pending' | 'signed' | 'verified';

export const DOCUMENT_STATUSES: DocumentStatus[] = ['pending', 'signed', 'verified'];

// ─── Allowed File Types (DOC-INV-02: magic bytes validated) ────────────────

export const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/tiff': 'tiff',
};

export const ALLOWED_EXTENSIONS = Object.values(ALLOWED_MIME_TYPES);

/** DOC-INV-03: Max file size 20MB */
export const MAX_FILE_SIZE = 20_971_520;

/** DOC-INV-03: Max 10 files per order */
export const MAX_DOCUMENTS_PER_ORDER = 10;

/** DOC-INV-05: Presigned URL expiry in seconds (15 minutes) */
export const PRESIGNED_URL_EXPIRY = 900;

// ─── Zoho Sign Types ───────────────────────────────────────────────────────

export interface ZohoSignRecipient {
  recipient_name: string;
  recipient_email: string;
  action_type: 'sign' | 'view' | 'approve';
}

export interface ZohoTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface ZohoCreateResponse {
  requests: {
    request_status: string;
    request_id: string;
    actions: Array<{ action_id: string; recipient_email: string }>;
  };
}

export interface ZohoWebhookPayload {
  requests: {
    request_status: string;
    request_id: string;
    document_ids: Array<{ document_id: string }>;
    actions: Array<{ action_id: string; action_status: string }>;
  };
}

// ─── Order Document Subdocument ────────────────────────────────────────────

export interface IOrderDocument {
  documentId: Types.ObjectId;
  fileName: string;
  fileUrl: string;
  documentType?: string;
  status: DocumentStatus;
  zohoRequestId?: string;
  docuSignEnvelopeId?: string;
}

// ─── Auth Request Extension ────────────────────────────────────────────────

export interface AuthRequest extends Request {
  user?: {
    _id: Types.ObjectId;
    userId: string;
    role: string;
    userType: number;
  };
  scopeFilter?: Record<string, unknown>;
}

// ─── Route Dependencies ────────────────────────────────────────────────────

export interface DocumentRouteDeps {
  OrderModel: Model<Document>;
  UserModel: Model<Document>;
  authenticate: () => RequestHandler;
  checkPermission: (resource: string, action: string) => RequestHandler;
  auditLog: {
    log: (entry: Record<string, unknown>) => Promise<void>;
  };
  zohoSignConfig: ZohoSignConfig;
}
