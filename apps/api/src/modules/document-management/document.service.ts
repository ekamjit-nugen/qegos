import type { Model, Document, Types } from 'mongoose';
import * as crypto from 'crypto';
import {
  uploadToS3,
  quarantineFile,
  getPresignedUrl,
  scanBuffer,
} from '@nugen/file-storage';
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  MAX_DOCUMENTS_PER_ORDER,
} from './document.types';
import * as zohoSign from './zohoSign.service';

// ─── Service Interface ─────────────────────────────────────────────────────

export interface DocumentServiceDeps {
  OrderModel: Model<Document>;
  auditLog: {
    log: (entry: Record<string, unknown>) => Promise<void>;
  };
}

export interface DocumentServiceResult {
  uploadDocument: (params: UploadParams) => Promise<{ fileUrl: string; documentIndex: number }>;
  uploadProof: (params: UploadProofParams) => Promise<{ fileUrl: string; documentIndex: number }>;
  listOrderDocuments: (params: ListParams) => Promise<OrderDocView[]>;
  createSigningRequest: (params: CreateSignParams) => Promise<{ zohoRequestId: string; actionId: string }>;
  sendForSignature: (orderId: string, zohoRequestId: string) => Promise<void>;
  generateEmbeddedUri: (params: GenerateUriParams) => Promise<{ signUrl: string }>;
  processZohoWebhook: (payload: import('./document.types').ZohoWebhookPayload) => Promise<void>;
}

interface UploadParams {
  orderId: string;
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number };
  userId: string;
  userType: number;
  documentType?: string;
}

interface UploadProofParams {
  orderId: string;
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number };
  userId: string;
}

interface ListParams {
  orderId: string;
  userId: string;
  userType: number;
}

interface CreateSignParams {
  orderId: string;
  documentIndex: number;
  recipientName: string;
  recipientEmail: string;
}

interface GenerateUriParams {
  orderId: string;
  zohoRequestId: string;
  actionId: string;
}

interface OrderDocView {
  documentId?: string;
  fileName: string;
  fileUrl: string;
  downloadUrl: string;
  documentType?: string;
  status: string;
  zohoRequestId?: string;
}

// ─── S3 Key Builder (DOC-INV-04) ──────────────────────────────────────────

function buildOrderDocS3Key(orderId: string, fileName: string): string {
  const uuid = crypto.randomUUID();
  return `orders/${orderId}/${uuid}-${fileName}`;
}

// ─── Magic Bytes Validation (DOC-INV-02) ───────────────────────────────────

/**
 * Validate file MIME type by checking magic bytes, not just extension.
 * Uses simple header matching for PDF, JPEG, PNG, TIFF, HEIC.
 */
function detectMimeType(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;

  // PDF: %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }
  // TIFF: 49 49 2A 00 (little-endian) or 4D 4D 00 2A (big-endian)
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2A && buffer[3] === 0x00) ||
    (buffer[0] === 0x4D && buffer[1] === 0x4D && buffer[2] === 0x00 && buffer[3] === 0x2A)
  ) {
    return 'image/tiff';
  }
  // HEIC: ftyp at offset 4
  if (buffer.length >= 12) {
    const ftyp = buffer.subarray(4, 8).toString('ascii');
    if (ftyp === 'ftyp') {
      const brand = buffer.subarray(8, 12).toString('ascii');
      if (brand === 'heic' || brand === 'heix' || brand === 'mif1') {
        return 'image/heic';
      }
    }
  }

  return null;
}

// ─── Service Factory ───────────────────────────────────────────────────────

export function createDocumentService(deps: DocumentServiceDeps): DocumentServiceResult {
  const { OrderModel, auditLog } = deps;

  /**
   * Upload a document to an order.
   * Enforces DOC-INV-01 (virus scan), DOC-INV-02 (magic bytes), DOC-INV-03 (limits), DOC-INV-04 (SSE-S3).
   */
  async function uploadDocument(params: UploadParams): Promise<{ fileUrl: string; documentIndex: number }> {
    const { orderId, file, documentType } = params;

    // DOC-INV-02: Validate by magic bytes
    const detectedMime = detectMimeType(file.buffer);
    if (!detectedMime || !ALLOWED_MIME_TYPES[detectedMime]) {
      throw Object.assign(new Error('File type not allowed. Accepted: PDF, JPG, PNG, HEIC, TIFF'), { status: 422 });
    }

    // DOC-INV-03: File size check (belt + suspenders with multer limit)
    if (file.size > MAX_FILE_SIZE) {
      throw Object.assign(new Error('File exceeds maximum size of 20MB'), { status: 422 });
    }

    // Load order and check document count (DOC-INV-03)
    const order = await OrderModel.findById(orderId) as Record<string, unknown> | null;
    if (!order) {
      throw Object.assign(new Error('Order not found'), { status: 404 });
    }

    const documents = (order.documents ?? []) as unknown[];
    if (documents.length >= MAX_DOCUMENTS_PER_ORDER) {
      throw Object.assign(new Error(`Maximum ${MAX_DOCUMENTS_PER_ORDER} documents per order`), { status: 422 });
    }

    // DOC-INV-01: Virus scan
    const scanResult = await scanBuffer(file.buffer);
    if (scanResult === 'infected') {
      const s3Key = buildOrderDocS3Key(orderId, file.originalname);
      await quarantineFile(file.buffer, s3Key, detectedMime);
      throw Object.assign(new Error('File failed virus scan and has been quarantined'), { status: 422 });
    }
    if (scanResult === 'error') {
      throw Object.assign(new Error('Virus scan unavailable. Upload rejected for safety.'), { status: 503 });
    }

    // DOC-INV-04: Upload to S3
    const s3Key = buildOrderDocS3Key(orderId, file.originalname);
    await uploadToS3(file.buffer, s3Key, detectedMime);

    // Push to order.documents[]
    const newDoc = {
      fileName: file.originalname,
      fileUrl: s3Key,
      documentType: documentType ?? 'general',
      status: 'pending',
    };

    await OrderModel.findByIdAndUpdate(orderId, {
      $push: { documents: newDoc },
    });

    return { fileUrl: s3Key, documentIndex: documents.length };
  }

  /**
   * Upload ID verification document (client-only).
   */
  async function uploadProof(params: UploadProofParams): Promise<{ fileUrl: string; documentIndex: number }> {
    return uploadDocument({
      ...params,
      userType: 7, // client
      documentType: 'id_verification',
    });
  }

  /**
   * List all documents for an order with presigned download URLs.
   * DOC-INV-05: 15-min presigned URLs. DOC-INV-06: staff access audit logged.
   */
  async function listOrderDocuments(params: ListParams): Promise<OrderDocView[]> {
    const { orderId, userId, userType } = params;

    const order = await OrderModel.findById(orderId).lean() as Record<string, unknown> | null;
    if (!order) {
      throw Object.assign(new Error('Order not found'), { status: 404 });
    }

    const documents = (order.documents ?? []) as Array<{
      documentId?: { toString(): string };
      fileName: string;
      fileUrl: string;
      documentType?: string;
      status: string;
      zohoRequestId?: string;
    }>;

    // Generate presigned URLs (DOC-INV-05: 15-min expiry configured in file-storage)
    const results: OrderDocView[] = await Promise.all(
      documents.map(async (doc) => ({
        documentId: doc.documentId?.toString(),
        fileName: doc.fileName,
        fileUrl: doc.fileUrl,
        downloadUrl: await getPresignedUrl(doc.fileUrl),
        documentType: doc.documentType,
        status: doc.status,
        zohoRequestId: doc.zohoRequestId,
      })),
    );

    // DOC-INV-06: Audit log for staff document access (severity=warning)
    const isStaff = userType !== 7; // userType 7 = client
    if (isStaff) {
      await auditLog.log({
        action: 'document.download',
        severity: 'warning',
        userId,
        orderId,
        documentCount: results.length,
        message: `Staff member accessed ${results.length} documents for order ${orderId}`,
      });
    }

    return results;
  }

  /**
   * Create a Zoho Sign signing request for a document in an order.
   */
  async function createSigningRequest(params: CreateSignParams): Promise<{ zohoRequestId: string; actionId: string }> {
    const { orderId, documentIndex, recipientName, recipientEmail } = params;

    const order = await OrderModel.findById(orderId) as Record<string, unknown> | null;
    if (!order) {
      throw Object.assign(new Error('Order not found'), { status: 404 });
    }

    const documents = (order.documents ?? []) as Array<{ fileName: string; fileUrl: string }>;
    if (documentIndex < 0 || documentIndex >= documents.length) {
      throw Object.assign(new Error('Document not found at specified index'), { status: 404 });
    }

    const doc = documents[documentIndex];

    // Download from S3 to get buffer for Zoho
    const { GetObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
    // We use getPresignedUrl + fetch as a simpler approach
    const presignedUrl = await getPresignedUrl(doc.fileUrl);
    const response = await fetch(presignedUrl);
    const fileBuffer = Buffer.from(await response.arrayBuffer());

    // Create Zoho signing request
    const result = await zohoSign.createSigningRequest({
      fileName: doc.fileName,
      fileBuffer,
      recipients: [{
        recipient_name: recipientName,
        recipient_email: recipientEmail,
        action_type: 'sign',
      }],
    });

    // Store zohoRequestId on the document subdoc
    await OrderModel.findOneAndUpdate(
      { _id: orderId },
      { $set: { [`documents.${documentIndex}.zohoRequestId`]: result.requestId } },
    );

    return { zohoRequestId: result.requestId, actionId: result.actionId };
  }

  /**
   * Submit a signing request for signatures.
   */
  async function sendForSignature(orderId: string, zohoRequestId: string): Promise<void> {
    // Verify the order has this zohoRequestId
    const order = await OrderModel.findOne({
      _id: orderId,
      'documents.zohoRequestId': zohoRequestId,
    }).lean();

    if (!order) {
      throw Object.assign(new Error('Order or signing request not found'), { status: 404 });
    }

    await zohoSign.sendForSignature(zohoRequestId);
  }

  /**
   * Generate embedded signing URI for in-app iframe.
   */
  async function generateEmbeddedUri(params: GenerateUriParams): Promise<{ signUrl: string }> {
    const { orderId, zohoRequestId, actionId } = params;

    const order = await OrderModel.findOne({
      _id: orderId,
      'documents.zohoRequestId': zohoRequestId,
    }).lean();

    if (!order) {
      throw Object.assign(new Error('Order or signing request not found'), { status: 404 });
    }

    return zohoSign.generateEmbeddedSigningUri(zohoRequestId, actionId);
  }

  /**
   * Process Zoho Sign webhook. Idempotent — skips if already signed.
   * On SIGN_COMPLETE: downloads signed PDF, re-uploads to S3, updates status.
   */
  async function processZohoWebhook(payload: import('./document.types').ZohoWebhookPayload): Promise<void> {
    const { request_id, request_status, document_ids } = payload.requests;

    if (request_status !== 'completed') return;

    // Find the order with this zohoRequestId
    const order = await OrderModel.findOne({
      'documents.zohoRequestId': request_id,
    }) as Record<string, unknown> | null;

    if (!order) return; // Unknown request, ignore

    const documents = (order.documents ?? []) as Array<{
      zohoRequestId?: string;
      status: string;
      fileUrl: string;
      fileName: string;
    }>;

    const docIndex = documents.findIndex((d) => d.zohoRequestId === request_id);
    if (docIndex === -1) return;

    // Idempotent: skip if already signed
    if (documents[docIndex].status === 'signed') return;

    // Download signed PDF from Zoho and re-upload to S3
    if (document_ids.length > 0) {
      const signedPdf = await zohoSign.getSignedDocument(request_id, document_ids[0].document_id);
      await uploadToS3(signedPdf, documents[docIndex].fileUrl, 'application/pdf');
    }

    // Update document status to 'signed'
    await OrderModel.findOneAndUpdate(
      { 'documents.zohoRequestId': request_id },
      { $set: { [`documents.${docIndex}.status`]: 'signed' } },
    );
  }

  return {
    uploadDocument,
    uploadProof,
    listOrderDocuments,
    createSigningRequest,
    sendForSignature,
    generateEmbeddedUri,
    processZohoWebhook,
  };
}
