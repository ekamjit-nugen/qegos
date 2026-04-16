/**
 * Admin-facing reconciliation queue routes.
 *
 *   GET  /admin/reconciliation                 list (filter by status, sagaName)
 *   GET  /admin/reconciliation/:id             ticket detail
 *   POST /admin/reconciliation/:id/resolve     mark resolved with notes
 *   POST /admin/reconciliation/:id/wont-fix    mark wont_fix with notes
 *
 * The list endpoint is the dashboard view ops uses to track open
 * tickets. Detail surfaces the saga's original error + compensation
 * failures + the metadata breadcrumbs (paymentId, orderId, userId,
 * etc.) so the resolver can find the affected records.
 *
 * Resolution endpoints are additive only — they cannot reopen a closed
 * ticket. If a resolved ticket turns out to be wrong, ops creates a
 * new ticket via direct DB insert. The audit log captures every
 * transition.
 */

import { Router, type Request, type Response, type RequestHandler } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import type { CheckPermissionFn } from '@nugen/rbac';
import type { ReconciliationServiceResult } from './reconciliation.service';
import type { ReconciliationStatus } from './reconciliation.types';
import { RECONCILIATION_STATUSES } from './reconciliation.types';

interface AuthRequest extends Request {
  user?: { _id: string; userId: string; userType: number };
}

export interface ReconciliationRouteDeps {
  reconciliationService: ReconciliationServiceResult;
  authenticate: () => RequestHandler;
  checkPermission: CheckPermissionFn;
}

export function createReconciliationRoutes(deps: ReconciliationRouteDeps): Router {
  const router = Router();
  const { reconciliationService } = deps;

  const authMiddleware =
    typeof deps.authenticate === 'function' && deps.authenticate.length === 0
      ? (deps.authenticate as unknown as () => RequestHandler)()
      : deps.authenticate;
  router.use(authMiddleware);

  // ── GET /admin/reconciliation ──────────────────────────────────────────
  router.get(
    '/admin/reconciliation',
    deps.checkPermission('reconciliation', 'read'),
    [
      query('status')
        .optional()
        .isIn(RECONCILIATION_STATUSES as readonly string[]),
      query('sagaName').optional().isString().isLength({ max: 200 }),
      query('page').optional().isInt({ min: 1 }).toInt(),
      query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    ],
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }
      const result = await reconciliationService.list({
        status: req.query.status as ReconciliationStatus | undefined,
        sagaName: req.query.sagaName as string | undefined,
        page: (req.query.page as number | undefined) ?? 1,
        limit: (req.query.limit as number | undefined) ?? 20,
      });
      res.status(200).json({ status: 200, data: result });
    },
  );

  // ── GET /admin/reconciliation/:id ──────────────────────────────────────
  router.get(
    '/admin/reconciliation/:id',
    deps.checkPermission('reconciliation', 'read'),
    [param('id').isMongoId()],
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }
      const item = await reconciliationService.getById(req.params.id);
      if (!item) {
        res.status(404).json({ status: 404, message: 'Reconciliation ticket not found' });
        return;
      }
      res.status(200).json({ status: 200, data: item });
    },
  );

  // ── POST /admin/reconciliation/:id/resolve ─────────────────────────────
  router.post(
    '/admin/reconciliation/:id/resolve',
    deps.checkPermission('reconciliation', 'update'),
    [param('id').isMongoId(), body('notes').isString().trim().isLength({ min: 5, max: 2000 })],
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }
      const authReq = req as AuthRequest;
      const actorId = authReq.user?.userId ?? authReq.user?._id;
      if (!actorId) {
        res.status(401).json({ status: 401, message: 'Authentication required' });
        return;
      }
      try {
        const item = await reconciliationService.resolve(req.params.id, req.body.notes, actorId);
        res.status(200).json({ status: 200, data: item });
      } catch (err) {
        const error = err as Error & { statusCode?: number; code?: string };
        res.status(error.statusCode ?? 500).json({
          status: error.statusCode ?? 500,
          code: error.code,
          message: error.message,
        });
      }
    },
  );

  // ── POST /admin/reconciliation/:id/wont-fix ────────────────────────────
  router.post(
    '/admin/reconciliation/:id/wont-fix',
    deps.checkPermission('reconciliation', 'update'),
    [param('id').isMongoId(), body('notes').isString().trim().isLength({ min: 5, max: 2000 })],
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }
      const authReq = req as AuthRequest;
      const actorId = authReq.user?.userId ?? authReq.user?._id;
      if (!actorId) {
        res.status(401).json({ status: 401, message: 'Authentication required' });
        return;
      }
      try {
        const item = await reconciliationService.wontFix(req.params.id, req.body.notes, actorId);
        res.status(200).json({ status: 200, data: item });
      } catch (err) {
        const error = err as Error & { statusCode?: number; code?: string };
        res.status(error.statusCode ?? 500).json({
          status: error.statusCode ?? 500,
          code: error.code,
          message: error.message,
        });
      }
    },
  );

  return router;
}
