import { Router, type Request, type Response, type RequestHandler } from 'express';
import type { Model, Types } from 'mongoose';
import { asyncHandler } from '@nugen/error-handler';
import { AppError } from '@nugen/error-handler';
import { validate } from '@nugen/validator';
import * as auditLog from '@nugen/audit-log';
import type { IErasureRequestDocument, IDataExportDocument, ModelFieldConfig } from '@nugen/data-lifecycle';
import {
  createErasureRequest,
  listErasureRequests,
  approveErasureRequest,
  rejectErasureRequest,
  executeErasure,
  getErasureRequest,
  createExportRequest,
  executeExport,
  listExports,
  getExport,
  validateErasureRequest,
  validateErasureApproval,
  validateErasureRejection,
  validateExportRequest,
  validateListErasureRequests,
  validateExportId,
} from '@nugen/data-lifecycle';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    userType: number;
    roleId: string;
  };
}

export interface PrivacyRouteDeps {
  ErasureRequestModel: Model<IErasureRequestDocument>;
  DataExportModel: Model<IDataExportDocument>;
  authenticate: () => RequestHandler;
  checkPermission: (resource: string, action: string) => RequestHandler;
}

export function createPrivacyRoutes(deps: PrivacyRouteDeps): Router {
  const router = Router();
  const { authenticate, checkPermission } = deps;

  // ═══════════════════════════════════════════════════════════════════════════
  // USER-FACING: Data Export (APP 12 — Right of Access)
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /export — Request data export (any authenticated user for themselves)
  router.post(
    '/export',
    authenticate() as RequestHandler,
    ...validate(validateExportRequest()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { format } = req.body as { format?: 'json' | 'csv' };
      const userId = authReq.user.userId as unknown as Types.ObjectId;

      const exportReq = await createExportRequest(userId, userId, format);

      // Execute immediately for now (could be queued for large datasets)
      const { exportData, exportDoc } = await executeExport(exportReq._id as Types.ObjectId);

      await auditLog.logFromRequest(req, {
        action: 'create',
        resource: 'data_export',
        resourceId: exportDoc._id.toString(),
        description: `User data export requested (${exportDoc.recordCount} records)`,
        severity: 'warning',
      });

      res.status(200).json({
        status: 200,
        data: {
          export: exportDoc,
          records: exportData,
        },
      });
    }),
  );

  // GET /export — List user's own exports
  router.get(
    '/export',
    authenticate() as RequestHandler,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user.userId as unknown as Types.ObjectId;

      const exports = await listExports(userId);

      res.status(200).json({
        status: 200,
        data: exports,
      });
    }),
  );

  // GET /export/:id — Get specific export
  router.get(
    '/export/:id',
    authenticate() as RequestHandler,
    ...validate(validateExportId()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const exportDoc = await getExport(req.params.id as unknown as Types.ObjectId);

      if (!exportDoc) {
        throw AppError.notFound('Data export');
      }

      // Users can only see their own exports (admins bypass via permission)
      if (exportDoc.userId.toString() !== authReq.user.userId) {
        throw AppError.forbidden();
      }

      res.status(200).json({
        status: 200,
        data: exportDoc,
      });
    }),
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // USER-FACING: Erasure Request (APP 11 — Data Destruction)
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /erasure — Request erasure of own data
  router.post(
    '/erasure',
    authenticate() as RequestHandler,
    ...validate(validateErasureRequest()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { reason } = req.body as { reason?: string };
      const userId = authReq.user.userId as unknown as Types.ObjectId;

      const request = await createErasureRequest(userId, userId, reason);

      await auditLog.logFromRequest(req, {
        action: 'create',
        resource: 'erasure_request',
        resourceId: request._id.toString(),
        description: 'User data erasure request submitted',
        severity: 'critical',
      });

      res.status(201).json({
        status: 201,
        data: request,
      });
    }),
  );

  // GET /erasure — User checks status of their own erasure request
  router.get(
    '/erasure',
    authenticate() as RequestHandler,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user.userId as unknown as Types.ObjectId;

      const { requests } = await listErasureRequests({});
      const userRequests = requests.filter(
        (r) => r.userId.toString() === userId.toString(),
      );

      res.status(200).json({
        status: 200,
        data: userRequests,
      });
    }),
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN: Erasure Management
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /admin/erasure-requests — List all erasure requests
  router.get(
    '/admin/erasure-requests',
    authenticate() as RequestHandler,
    checkPermission('privacy', 'manage') as RequestHandler,
    ...validate(validateListErasureRequests()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { status, page, limit } = req.query as {
        status?: string;
        page?: number;
        limit?: number;
      };

      const result = await listErasureRequests({ status, page, limit });

      res.status(200).json({
        status: 200,
        data: result.requests,
        pagination: {
          total: result.total,
          page: Number(page) || 1,
          limit: Number(limit) || 20,
        },
      });
    }),
  );

  // PUT /admin/erasure-requests/:id/approve — Approve erasure request
  router.put(
    '/admin/erasure-requests/:id/approve',
    authenticate() as RequestHandler,
    checkPermission('privacy', 'manage') as RequestHandler,
    ...validate(validateErasureApproval()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const requestId = req.params.id as unknown as Types.ObjectId;
      const approvedBy = authReq.user.userId as unknown as Types.ObjectId;

      const request = await approveErasureRequest(requestId, approvedBy);
      if (!request) {
        throw AppError.notFound('Erasure request');
      }

      await auditLog.logFromRequest(req, {
        action: 'approve',
        resource: 'erasure_request',
        resourceId: request._id.toString(),
        description: `Erasure request approved for user ${request.userId}`,
        severity: 'critical',
      });

      res.status(200).json({
        status: 200,
        data: request,
      });
    }),
  );

  // PUT /admin/erasure-requests/:id/reject — Reject erasure request
  router.put(
    '/admin/erasure-requests/:id/reject',
    authenticate() as RequestHandler,
    checkPermission('privacy', 'manage') as RequestHandler,
    ...validate(validateErasureRejection()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const requestId = req.params.id as unknown as Types.ObjectId;
      const { rejectionReason } = req.body as { rejectionReason: string };

      const request = await rejectErasureRequest(requestId, rejectionReason);
      if (!request) {
        throw AppError.notFound('Erasure request');
      }

      await auditLog.logFromRequest(req, {
        action: 'reject',
        resource: 'erasure_request',
        resourceId: request._id.toString(),
        description: `Erasure request rejected: ${rejectionReason}`,
        severity: 'warning',
      });

      res.status(200).json({
        status: 200,
        data: request,
      });
    }),
  );

  // POST /admin/erasure-requests/:id/execute — Execute approved erasure
  router.post(
    '/admin/erasure-requests/:id/execute',
    authenticate() as RequestHandler,
    checkPermission('privacy', 'manage') as RequestHandler,
    ...validate(validateErasureApproval()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const requestId = req.params.id as unknown as Types.ObjectId;

      const result = await executeErasure(requestId);

      await auditLog.logFromRequest(req, {
        action: 'execute',
        resource: 'erasure_request',
        resourceId: result._id.toString(),
        description: `Erasure executed: ${result.recordsAnonymized} anonymized, ${result.recordsDeleted} deleted across ${result.modelsProcessed.length} models`,
        severity: 'critical',
      });

      res.status(200).json({
        status: 200,
        data: result,
      });
    }),
  );

  return router;
}
