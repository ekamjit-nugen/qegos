import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { validationResult } from 'express-validator';
import type { Types } from 'mongoose';
import type { FileStorageRouteDeps } from '@nugen/file-storage';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '@nugen/file-storage';

// ─── Multer (20MB limit, in-memory for virus scan before S3) ──────────────
const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});
import {
  uploadDocumentValidation,
  updateDocumentValidation,
  getDocumentValidation,
  deleteDocumentValidation,
  listDocumentsValidation,
  prefillValidation,
  createTaxSummaryValidation,
  yoyComparisonValidation,
  getAtoStatusValidation,
  updateAtoStatusValidation,
  bulkUpdateAtoStatusValidation,
} from './portal.validators';
import {
  initPortalService,
  uploadDocument,
  listDocuments,
  getDocument,
  updateDocument,
  archiveDocument,
  restoreDocument,
  listFinancialYears,
  getStorageUsage,
  upsertTaxSummary,
  listTaxSummaries,
  getYoYComparison,
  getAtoStatus,
  updateAtoStatus,
  bulkUpdateAtoStatus,
  getPrefillData,
} from './portal.service';
import type {
  AuthRequest,
  UploadDocumentBody,
  AtoStatusUpdateBody,
  BulkAtoStatusUpdate,
  CreateTaxSummaryBody,
} from './portal.types';

// ─── ObjectId cast helper ──────────────────────────────────────────────────
const toOid = (s: string): Types.ObjectId => s as unknown as Types.ObjectId;

// ─── Validation Error Helper ────────────────────────────────────────────────

function handleValidation(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      status: 400,
      code: 'VALIDATION_ERROR',
      errors: errors.array(),
    });
    return false;
  }
  return true;
}

// ─── Route Factory ──────────────────────────────────────────────────────────

export function createPortalRoutes(deps: FileStorageRouteDeps): Router {
  const router = Router();

  // Initialize service with models
  initPortalService(deps.VaultDocumentModel, deps.TaxYearSummaryModel);

  // All routes require authentication
  // deps.authenticate may be a factory (() => RequestHandler) or a direct RequestHandler
  const authMiddleware =
    typeof deps.authenticate === 'function' && deps.authenticate.length === 0
      ? (deps.authenticate as unknown as () => import('express').RequestHandler)()
      : deps.authenticate;
  router.use(authMiddleware);

  // ═══════════════════════════════════════════════════════════════════════════
  // VAULT ENDPOINTS (9)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── POST /vault/upload ────────────────────────────────────────────────

  router.post(
    '/vault/upload',
    uploadMiddleware.single('file'),
    ...uploadDocumentValidation,
    async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }
      const authReq = req as AuthRequest;
      const user = authReq.user!;

      // Check for file in request (expects multipart/form-data via multer)
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) {
        res.status(400).json({ status: 400, code: 'NO_FILE', message: 'No file uploaded' });
        return;
      }

      // CPV-INV-04: Magic bytes validation
      if (!ALLOWED_MIME_TYPES[file.mimetype]) {
        res.status(400).json({
          status: 400,
          code: 'INVALID_FILE_TYPE',
          message: `Allowed types: ${Object.values(ALLOWED_MIME_TYPES).join(', ')}`,
        });
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        res.status(400).json({
          status: 400,
          code: 'FILE_TOO_LARGE',
          message: `Max file size: ${MAX_FILE_SIZE / 1_048_576}MB`,
        });
        return;
      }

      const body = req.body as UploadDocumentBody;

      try {
        const result = await uploadDocument({
          userId: toOid(user.userId),
          financialYear: body.financialYear,
          category: body.category as import('@nugen/file-storage').VaultDocumentCategory,
          fileName: file.originalname,
          mimeType: file.mimetype,
          buffer: file.buffer,
          uploadedBy: user.userType >= 5 ? 'client' : 'staff',
          uploadedByUserId: toOid(user.userId),
          description: body.description,
          tags: body.tags,
        });

        const response: Record<string, unknown> = {
          status: 201,
          data: { document: result.document },
        };
        if (result.duplicateWarning) {
          response.warning = {
            code: 'DUPLICATE_FILE',
            message: `This file appears identical to "${result.duplicateWarning.existingFile?.fileName}" uploaded previously. Upload succeeded.`,
            existingFile: result.duplicateWarning.existingFile,
          };
        }

        res.status(201).json(response);
      } catch (err) {
        const error = err as Error & {
          statusCode?: number;
          code?: string;
          details?: Record<string, unknown>;
        };
        res.status(error.statusCode ?? 500).json({
          status: error.statusCode ?? 500,
          code: error.code ?? 'UPLOAD_ERROR',
          message: error.message,
          ...(error.details && { details: error.details }),
        });
      }
    },
  );

  // ── POST /vault/bulk-upload ───────────────────────────────────────────

  router.post(
    '/vault/bulk-upload',
    uploadMiddleware.array('files', 10),
    async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthRequest;
      const user = authReq.user!;

      const files = (req as Request & { files?: Express.Multer.File[] }).files;
      if (!files || files.length === 0) {
        res.status(400).json({ status: 400, code: 'NO_FILES', message: 'No files uploaded' });
        return;
      }

      const body = req.body as UploadDocumentBody;
      const results: Array<{
        fileName: string;
        success: boolean;
        error?: string;
        warning?: string;
      }> = [];

      for (const file of files) {
        try {
          if (!ALLOWED_MIME_TYPES[file.mimetype]) {
            results.push({
              fileName: file.originalname,
              success: false,
              error: 'Invalid file type',
            });
            continue;
          }
          if (file.size > MAX_FILE_SIZE) {
            results.push({ fileName: file.originalname, success: false, error: 'File too large' });
            continue;
          }

          const result = await uploadDocument({
            userId: toOid(user.userId),
            financialYear: body.financialYear,
            category: body.category as import('@nugen/file-storage').VaultDocumentCategory,
            fileName: file.originalname,
            mimeType: file.mimetype,
            buffer: file.buffer,
            uploadedBy: user.userType >= 5 ? 'client' : 'staff',
            uploadedByUserId: toOid(user.userId),
            description: body.description,
            tags: body.tags,
          });

          results.push({
            fileName: file.originalname,
            success: true,
            ...(result.duplicateWarning && { warning: 'Duplicate file detected' }),
          });
        } catch (err) {
          results.push({
            fileName: file.originalname,
            success: false,
            error: (err as Error).message,
          });
        }
      }

      res.status(200).json({ status: 200, data: { results } });
    },
  );

  // ── GET /vault/documents ──────────────────────────────────────────────

  router.get(
    '/vault/documents',
    ...listDocumentsValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }
      const user = (req as AuthRequest).user!;

      const query = req.query as {
        financialYear?: string;
        category?: string;
        page?: string;
        limit?: string;
      };

      const result = await listDocuments({
        userId: toOid(user.userId),
        financialYear: query.financialYear,
        category: query.category as import('@nugen/file-storage').VaultDocumentCategory | undefined,
        page: query.page ? parseInt(query.page, 10) : undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
      });

      res.status(200).json({ status: 200, data: result });
    },
  );

  // ── GET /vault/documents/:id ──────────────────────────────────────────

  router.get(
    '/vault/documents/:id',
    ...getDocumentValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }
      const user = (req as AuthRequest).user!;

      const result = await getDocument(
        req.params.id as unknown as Types.ObjectId,
        toOid(user.userId),
      );

      if (!result) {
        res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Document not found' });
        return;
      }

      // CPV-INV-08: Audit log if staff accessing client vault
      if (user.userType < 5) {
        await deps.auditLog.log({
          actor: user.userId,
          action: 'vault.document.access',
          resource: 'VaultDocument',
          resourceId: req.params.id,
          severity: 'warning',
          metadata: { userId: result.document.userId.toString() },
        });
      }

      res.status(200).json({ status: 200, data: result });
    },
  );

  // ── PUT /vault/documents/:id ──────────────────────────────────────────

  router.put(
    '/vault/documents/:id',
    ...updateDocumentValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }
      const user = (req as AuthRequest).user!;

      const doc = await updateDocument(
        req.params.id as unknown as Types.ObjectId,
        toOid(user.userId),
        req.body as {
          category?: import('@nugen/file-storage').VaultDocumentCategory;
          description?: string;
          tags?: string[];
        },
      );

      if (!doc) {
        res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Document not found' });
        return;
      }

      res.status(200).json({ status: 200, data: { document: doc } });
    },
  );

  // ── DELETE /vault/documents/:id (CPV-INV-05: soft delete) ─────────────

  router.delete(
    '/vault/documents/:id',
    ...deleteDocumentValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }
      const user = (req as AuthRequest).user!;

      const doc = await archiveDocument(
        req.params.id as unknown as Types.ObjectId,
        toOid(user.userId),
      );

      if (!doc) {
        res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Document not found' });
        return;
      }

      res.status(200).json({
        status: 200,
        message: 'Document archived. Will be permanently deleted after 30 days.',
      });
    },
  );

  // ── POST /vault/documents/:id/restore — Restore archived document ────

  router.post(
    '/vault/documents/:id/restore',
    ...getDocumentValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }
      const user = (req as AuthRequest).user!;

      const doc = await restoreDocument(
        req.params.id as unknown as Types.ObjectId,
        toOid(user.userId),
      );

      if (!doc) {
        res
          .status(404)
          .json({ status: 404, code: 'NOT_FOUND', message: 'Archived document not found' });
        return;
      }

      res.status(200).json({ status: 200, data: doc });
    },
  );

  // ── GET /vault/years ──────────────────────────────────────────────────

  router.get('/vault/years', async (req: Request, res: Response): Promise<void> => {
    const user = (req as AuthRequest).user!;
    const years = await listFinancialYears(toOid(user.userId));
    res.status(200).json({ status: 200, data: { years } });
  });

  // ── GET /vault/storage ────────────────────────────────────────────────

  router.get('/vault/storage', async (req: Request, res: Response): Promise<void> => {
    const user = (req as AuthRequest).user!;
    const usage = await getStorageUsage(toOid(user.userId));
    res.status(200).json({ status: 200, data: usage });
  });

  // ── GET /vault/prefill/:financialYear (CPV-INV-10) ────────────────────

  router.get(
    '/vault/prefill/:financialYear',
    ...prefillValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }
      const user = (req as AuthRequest).user!;

      const prefill = await getPrefillData(toOid(user.userId), req.params.financialYear);

      if (!prefill) {
        res.status(200).json({
          status: 200,
          data: { suggested: null, source: null, message: 'No prior-year data available' },
        });
        return;
      }

      res.status(200).json({ status: 200, data: prefill });
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // TAX SUMMARY ENDPOINTS (3)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── POST /tax-summaries (CPV-INV-09: system/admin only) ───────────────

  router.post(
    '/tax-summaries',
    deps.checkPermission('portal', 'manage') as import('express').RequestHandler,
    ...createTaxSummaryValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }

      const body = req.body as CreateTaxSummaryBody;
      const summary = await upsertTaxSummary(body as unknown as Record<string, unknown>);

      res.status(201).json({ status: 201, data: { summary } });
    },
  );

  // ── GET /tax-summaries ────────────────────────────────────────────────

  router.get('/tax-summaries', async (req: Request, res: Response): Promise<void> => {
    const user = (req as AuthRequest).user!;
    const summaries = await listTaxSummaries(toOid(user.userId));
    res.status(200).json({ status: 200, data: { summaries } });
  });

  // ── GET /tax-summaries/:year/compare ──────────────────────────────────

  router.get(
    '/tax-summaries/:year/compare',
    ...yoyComparisonValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }
      const user = (req as AuthRequest).user!;

      const comparison = await getYoYComparison(toOid(user.userId), req.params.year);

      if (!comparison) {
        res.status(404).json({
          status: 404,
          code: 'NOT_FOUND',
          message: 'No tax summary found for this financial year',
        });
        return;
      }

      res.status(200).json({ status: 200, data: comparison });
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ATO STATUS ENDPOINTS (3)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /ato-status/:year ─────────────────────────────────────────────

  router.get(
    '/ato-status/:year',
    ...getAtoStatusValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }
      const user = (req as AuthRequest).user!;

      const status = await getAtoStatus(toOid(user.userId), req.params.year);

      if (!status) {
        res.status(404).json({
          status: 404,
          code: 'NOT_FOUND',
          message: 'No ATO status found for this year',
        });
        return;
      }

      res.status(200).json({ status: 200, data: { atoStatus: status } });
    },
  );

  // ── PUT /ato-status/:year (staff+) ────────────────────────────────────

  router.put(
    '/ato-status/:year',
    deps.checkPermission('portal', 'manage') as import('express').RequestHandler,
    ...updateAtoStatusValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }

      const body = req.body as AtoStatusUpdateBody;
      const updated = await updateAtoStatus(
        body.userId as unknown as Types.ObjectId,
        req.params.year,
        {
          atoRefundStatus: body.atoRefundStatus,
          ...(body.assessmentDate && { assessmentDate: new Date(body.assessmentDate) }),
          ...(body.noaReceived !== undefined && { noaReceived: body.noaReceived }),
          ...(body.atoRefundIssuedDate && {
            atoRefundIssuedDate: new Date(body.atoRefundIssuedDate),
          }),
        },
      );

      if (!updated) {
        res.status(404).json({
          status: 404,
          code: 'NOT_FOUND',
          message: 'No tax summary found for this user/year',
        });
        return;
      }

      res.status(200).json({ status: 200, data: { atoStatus: updated } });
    },
  );

  // ── PUT /ato-status/bulk (admin only) ─────────────────────────────────

  router.put(
    '/ato-status/bulk',
    deps.checkPermission('portal', 'admin') as import('express').RequestHandler,
    ...bulkUpdateAtoStatusValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }

      const { updates } = req.body as { updates: BulkAtoStatusUpdate[] };

      const modified = await bulkUpdateAtoStatus(
        updates.map((u) => ({
          userId: u.userId as unknown as Types.ObjectId,
          financialYear: u.financialYear,
          atoRefundStatus: u.atoRefundStatus,
          ...(u.assessmentDate && { assessmentDate: new Date(u.assessmentDate) }),
          ...(u.noaReceived !== undefined && { noaReceived: u.noaReceived }),
          ...(u.atoRefundIssuedDate && { atoRefundIssuedDate: new Date(u.atoRefundIssuedDate) }),
        })),
      );

      res.status(200).json({
        status: 200,
        data: { modified, total: updates.length },
      });
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN VAULT ENDPOINTS — staff access to client vaults
  // ═══════════════════════════════════════════════════════════════════════════

  const adminGuard = deps.checkPermission('portal', 'manage') as import('express').RequestHandler;

  // ── GET /vault/admin/users/:userId/documents ─────────────────────────

  router.get(
    '/vault/admin/users/:userId/documents',
    adminGuard,
    ...listDocumentsValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }
      const { userId } = req.params;
      const { financialYear, category, page, limit } = req.query as Record<
        string,
        string | undefined
      >;

      const result = await listDocuments({
        userId: toOid(userId),
        financialYear,
        category: category as import('@nugen/file-storage').VaultDocumentCategory | undefined,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });

      // Audit log staff access
      const authReq = req as AuthRequest;
      if (deps.auditLog?.log) {
        void deps.auditLog.log({
          userId: authReq.user!.userId,
          action: 'read',
          resource: 'vault_documents',
          resourceId: userId,
          description: `Staff viewed client vault documents`,
        });
      }

      res.status(200).json({ status: 200, ...result });
    },
  );

  // ── GET /vault/admin/users/:userId/documents/:docId ──────────────────

  router.get(
    '/vault/admin/users/:userId/documents/:docId',
    adminGuard,
    async (req: Request, res: Response): Promise<void> => {
      const { userId, docId } = req.params;
      const result = await getDocument(docId as unknown as Types.ObjectId, toOid(userId));

      if (!result) {
        res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Document not found' });
        return;
      }

      res.status(200).json({ status: 200, data: result });
    },
  );

  // ── GET /vault/admin/users/:userId/storage ───────────────────────────

  router.get(
    '/vault/admin/users/:userId/storage',
    adminGuard,
    async (req: Request, res: Response): Promise<void> => {
      const { userId } = req.params;
      const usage = await getStorageUsage(toOid(userId));
      res.status(200).json({ status: 200, data: usage });
    },
  );

  // ── POST /vault/admin/users/:userId/upload ───────────────────────────

  router.post(
    '/vault/admin/users/:userId/upload',
    adminGuard,
    uploadMiddleware.single('file'),
    ...uploadDocumentValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }
      const authReq = req as AuthRequest;
      const { userId } = req.params;

      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) {
        res.status(400).json({ status: 400, code: 'NO_FILE', message: 'No file uploaded' });
        return;
      }

      if (!ALLOWED_MIME_TYPES[file.mimetype]) {
        res.status(400).json({
          status: 400,
          code: 'INVALID_FILE_TYPE',
          message: `Allowed types: ${Object.values(ALLOWED_MIME_TYPES).join(', ')}`,
        });
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        res.status(400).json({
          status: 400,
          code: 'FILE_TOO_LARGE',
          message: `Max file size: ${MAX_FILE_SIZE / 1_048_576}MB`,
        });
        return;
      }

      const body = req.body as UploadDocumentBody;

      try {
        const result = await uploadDocument({
          userId: toOid(userId),
          financialYear: body.financialYear,
          category: body.category as import('@nugen/file-storage').VaultDocumentCategory,
          fileName: file.originalname,
          mimeType: file.mimetype,
          buffer: file.buffer,
          uploadedBy: 'staff',
          uploadedByUserId: toOid(authReq.user!.userId),
          description: body.description,
          tags: body.tags,
        });

        // Audit log staff upload
        if (deps.auditLog?.log) {
          void deps.auditLog.log({
            userId: authReq.user!.userId,
            action: 'create',
            resource: 'vault_documents',
            resourceId: userId,
            description: `Staff uploaded "${file.originalname}" to client vault`,
          });
        }

        res.status(201).json({
          status: 201,
          data: { document: result.document },
          ...(result.duplicateWarning && {
            warning: {
              code: 'DUPLICATE_FILE',
              message: `Duplicate file detected`,
              existingFile: result.duplicateWarning.existingFile,
            },
          }),
        });
      } catch (err) {
        const error = err as Error & { statusCode?: number; code?: string };
        res.status(error.statusCode ?? 500).json({
          status: error.statusCode ?? 500,
          code: error.code ?? 'UPLOAD_ERROR',
          message: error.message,
        });
      }
    },
  );

  return router;
}
