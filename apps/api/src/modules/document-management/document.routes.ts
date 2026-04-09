import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { validationResult } from 'express-validator';
import type { DocumentRouteDeps, AuthRequest, ZohoWebhookPayload } from './document.types';
import { MAX_FILE_SIZE } from './document.types';
import { createDocumentService } from './document.service';
import { initZohoSignService, verifyWebhookSignature } from './zohoSign.service';
import {
  uploadDocumentValidation,
  uploadProofValidation,
  createSigningValidation,
  sendForSignValidation,
  generateUriValidation,
  listOrderDocumentsValidation,
} from './document.validators';

// ─── Multer (DOC-INV-03: 20MB limit, in-memory) ───────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

// ─── Validation Helper ─────────────────────────────────────────────────────

function handleValidation(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', errors: errors.array() });
    return true;
  }
  return false;
}

// ─── Document Routes ───────────────────────────────────────────────────────

/**
 * Create document management routes.
 * Mounted under /documents.
 */
export function createDocumentRoutes(deps: DocumentRouteDeps): Router {
  // Initialize Zoho Sign service
  initZohoSignService(deps.zohoSignConfig);

  const service = createDocumentService({
    OrderModel: deps.OrderModel,
    auditLog: deps.auditLog,
  });

  const router = Router();
  const auth = [deps.authenticate()];
  const authStaff = [deps.authenticate(), deps.checkPermission('documents', 'manage')];

  // 1. POST /upload — Upload document to order (DOC-INV-01/02/03/04)
  router.post(
    '/upload',
    ...auth,
    upload.single('file'),
    ...uploadDocumentValidation,
    async (req: Request, res: Response) => {
      if (handleValidation(req, res)) return;
      try {
        const authReq = req as AuthRequest;
        if (!req.file) {
          res.status(400).json({ status: 400, code: 'NO_FILE', message: 'File is required' });
          return;
        }
        const result = await service.uploadDocument({
          orderId: req.body.orderId as string,
          file: req.file,
          userId: String(authReq.user?._id),
          userType: authReq.user?.userType ?? 7,
          documentType: req.body.documentType as string | undefined,
        });
        res.status(201).json({ status: 201, data: result });
      } catch (err) {
        const error = err as Error & { status?: number };
        res.status(error.status ?? 500).json({
          status: error.status ?? 500,
          code: error.status === 422 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
          message: error.message,
        });
      }
    },
  );

  // 2. POST /upload-proof — Upload ID verification document (client-only)
  router.post(
    '/upload-proof',
    ...auth,
    upload.single('file'),
    ...uploadProofValidation,
    async (req: Request, res: Response) => {
      if (handleValidation(req, res)) return;
      try {
        const authReq = req as AuthRequest;
        if (!req.file) {
          res.status(400).json({ status: 400, code: 'NO_FILE', message: 'File is required' });
          return;
        }
        const result = await service.uploadProof({
          orderId: req.body.orderId as string,
          file: req.file,
          userId: String(authReq.user?._id),
        });
        res.status(201).json({ status: 201, data: result });
      } catch (err) {
        const error = err as Error & { status?: number };
        res.status(error.status ?? 500).json({
          status: error.status ?? 500,
          code: error.status === 422 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
          message: error.message,
        });
      }
    },
  );

  // 3. GET /order/:orderId — List order documents (DOC-INV-05/06)
  router.get(
    '/order/:orderId',
    ...auth,
    ...listOrderDocumentsValidation,
    async (req: Request, res: Response) => {
      if (handleValidation(req, res)) return;
      try {
        const authReq = req as AuthRequest;
        const documents = await service.listOrderDocuments({
          orderId: req.params.orderId,
          userId: String(authReq.user?._id),
          userType: authReq.user?.userType ?? 7,
        });
        res.json({ status: 200, data: documents });
      } catch (err) {
        const error = err as Error & { status?: number };
        res.status(error.status ?? 500).json({
          status: error.status ?? 500,
          code: 'INTERNAL_ERROR',
          message: error.message,
        });
      }
    },
  );

  // 4. POST /create — Create Zoho Sign signing request
  router.post(
    '/create',
    ...authStaff,
    ...createSigningValidation,
    async (req: Request, res: Response) => {
      if (handleValidation(req, res)) return;
      try {
        const result = await service.createSigningRequest({
          orderId: req.body.orderId as string,
          documentIndex: Number(req.body.documentIndex),
          recipientName: req.body.recipientName as string,
          recipientEmail: req.body.recipientEmail as string,
        });
        res.status(201).json({ status: 201, data: result });
      } catch (err) {
        const error = err as Error & { status?: number };
        res.status(error.status ?? 500).json({
          status: error.status ?? 500,
          code: 'INTERNAL_ERROR',
          message: error.message,
        });
      }
    },
  );

  // 5. POST /send-for-sign — Send signing request for signatures
  router.post(
    '/send-for-sign',
    ...authStaff,
    ...sendForSignValidation,
    async (req: Request, res: Response) => {
      if (handleValidation(req, res)) return;
      try {
        await service.sendForSignature(
          req.body.orderId as string,
          req.body.zohoRequestId as string,
        );
        res.json({ status: 200, message: 'Signing request sent successfully' });
      } catch (err) {
        const error = err as Error & { status?: number };
        res.status(error.status ?? 500).json({
          status: error.status ?? 500,
          code: 'INTERNAL_ERROR',
          message: error.message,
        });
      }
    },
  );

  // 6. POST /generate-uri — Generate embedded signing URL
  router.post(
    '/generate-uri',
    ...auth,
    ...generateUriValidation,
    async (req: Request, res: Response) => {
      if (handleValidation(req, res)) return;
      try {
        const result = await service.generateEmbeddedUri({
          orderId: req.body.orderId as string,
          zohoRequestId: req.body.zohoRequestId as string,
          actionId: req.body.actionId as string,
        });
        res.json({ status: 200, data: result });
      } catch (err) {
        const error = err as Error & { status?: number };
        res.status(error.status ?? 500).json({
          status: error.status ?? 500,
          code: 'INTERNAL_ERROR',
          message: error.message,
        });
      }
    },
  );

  return router;
}

// ─── Zoho Webhook Route ────────────────────────────────────────────────────

/**
 * Create Zoho Sign webhook route.
 * Mounted under /webhooks. Public endpoint with signature verification.
 */
export function createZohoWebhookRoute(deps: DocumentRouteDeps): Router {
  const service = createDocumentService({
    OrderModel: deps.OrderModel,
    auditLog: deps.auditLog,
  });

  const router = Router();

  // POST /zoho — Zoho Sign webhook (public, signature verified)
  router.post('/zoho', async (req: Request, res: Response) => {
    try {
      const rawBody = typeof req.body === 'string'
        ? req.body
        : Buffer.isBuffer(req.body)
          ? req.body.toString('utf8')
          : JSON.stringify(req.body);

      const signature = req.headers['x-zoho-sign-webhook-token'] as string | undefined;

      if (!signature || !verifyWebhookSignature(rawBody, signature)) {
        res.status(401).json({ status: 401, code: 'WEBHOOK_INVALID', message: 'Invalid webhook signature' });
        return;
      }

      const payload = (typeof req.body === 'string' || Buffer.isBuffer(req.body))
        ? JSON.parse(rawBody) as ZohoWebhookPayload
        : req.body as ZohoWebhookPayload;

      await service.processZohoWebhook(payload);
      res.status(200).json({ status: 200, message: 'Webhook processed' });
    } catch (err) {
      res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
    }
  });

  return router;
}
