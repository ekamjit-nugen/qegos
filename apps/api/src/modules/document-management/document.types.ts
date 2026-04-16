import type { Model, Types } from 'mongoose';
import type { Request, RequestHandler } from 'express';
import type { CheckPermissionFn } from '@nugen/rbac';
import type { AuditLogDI } from '@nugen/audit-log';

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

export type SigningStatus =
  | 'not_started'
  | 'awaiting_client'
  | 'client_signed'
  | 'awaiting_admin'
  | 'completed'
  | 'declined';

export const SIGNING_STATUSES: SigningStatus[] = [
  'not_started',
  'awaiting_client',
  'client_signed',
  'awaiting_admin',
  'completed',
  'declined',
];

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
  signing_order?: number;
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
    actions: Array<{ action_id: string; recipient_email: string; signing_order?: number }>;
  };
}

export interface ZohoWebhookPayload {
  requests: {
    request_status: string;
    request_id: string;
    document_ids: Array<{ document_id: string }>;
    actions: Array<{ action_id: string; action_status: string; recipient_email: string }>;
  };
  notifications?: {
    performed_by_email: string;
    action_type: string;
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
  signingStatus: SigningStatus;
  clientActionId?: string;
  adminActionId?: string;
  clientSignedAt?: Date;
  adminSignedAt?: Date;
  clientEmail?: string;
  adminEmail?: string;
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
  /* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose Model<T> invariance; app passes Model<IFooDocument> */
  OrderModel: Model<any>;
  UserModel: Model<any>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  authenticate: () => RequestHandler;
  checkPermission: CheckPermissionFn;
  auditLog: AuditLogDI;
  zohoSignConfig: ZohoSignConfig;
}
