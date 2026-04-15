/**
 * Consent Form — Express Router.
 *
 * Mounted under /api/v1/consent-forms. Authenticated clients (portal
 * users) can POST a new submission and list / read their own. There is
 * NO decrypt endpoint — responses only ever contain last-4 / year
 * projections, never ciphertext and never plaintext secrets.
 */

import { Router, type Request, type Response, type RequestHandler } from 'express';
import type { Model } from 'mongoose';
import { asyncHandler } from '@nugen/error-handler';
import { validate } from '@nugen/validator';
import * as _auditLog from '@nugen/audit-log';
import type { CheckPermissionFn } from '@nugen/rbac';
import { getRequestId } from '../../lib/requestContext';

import type { IConsentFormDocument, CreateConsentFormInput } from './consentForm.types';
import { createConsentFormService } from './consentForm.service';
import { createConsentFormValidation } from './consentForm.validators';

// Wrap audit log to swallow failures (pattern from form-mapping routes)
const auditLog = {
  log: (params: Record<string, unknown>): void => {
    _auditLog.log({ ...params, requestId: getRequestId() } as never).catch(() => {
      // fire-and-forget: audit log failure is non-critical
    });
  },
};

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    userType: number;
    roleId: string;
  };
}

export interface ConsentFormRouteDeps {
  ConsentFormModel: Model<IConsentFormDocument>;
  authenticate: () => RequestHandler;
  checkPermission: CheckPermissionFn;
}

const RESOURCE = 'consent_forms';

export function createConsentFormRoutes(deps: ConsentFormRouteDeps): Router {
  const router = Router();
  const { authenticate: auth, checkPermission: check } = deps;
  const service = createConsentFormService({ ConsentFormModel: deps.ConsentFormModel });

  // ─── POST /  — submit a new consent form ────────────────────────────
  router.post(
    '/',
    auth() as never,
    ...validate(createConsentFormValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const input = req.body as CreateConsentFormInput;
      const submission = await service.createSubmission(input, authReq.user.userId);

      auditLog.log({
        actor: authReq.user.userId,
        actorType: 'client',
        action: 'create',
        resource: 'consent_forms',
        resourceId: submission._id,
        description: 'Client submitted consent form (sensitive fields encrypted at rest)',
        severity: 'info',
      });

      res.status(201).json({ status: 201, data: submission });
    }),
  );

  // ─── GET /  — list my submissions ───────────────────────────────────
  router.get(
    '/',
    auth() as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const rows = await service.listByUser(authReq.user.userId);
      res.status(200).json({ status: 200, data: rows });
    }),
  );

  // ─── GET /admin  — admin: list ALL submissions across users ────────
  // Registered BEFORE /:id so Express matches the literal first.
  router.get(
    '/admin',
    auth() as never,
    check(RESOURCE, 'read') as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const q = req.query as Record<string, string | undefined>;
      const result = await service.listAll({
        userId: q.userId,
        workType: q.workType,
        search: q.search,
        limit: q.limit ? Number(q.limit) : undefined,
        skip: q.skip ? Number(q.skip) : undefined,
      });

      auditLog.log({
        actor: authReq.user.userId,
        actorType: 'admin',
        action: 'read',
        resource: RESOURCE,
        resourceId: 'list',
        description: `Admin listed consent form submissions (count=${result.rows.length})`,
        severity: 'info',
      });

      res.status(200).json({
        status: 200,
        data: result.rows,
        meta: { total: result.total },
      });
    }),
  );

  // ─── GET /admin/:id  — admin: fetch any submission without userId scoping ──
  router.get(
    '/admin/:id',
    auth() as never,
    check(RESOURCE, 'read') as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const id = req.params.id as string;
      const row = await service.getByIdAdmin(id);
      if (!row) {
        res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Submission not found' });
        return;
      }

      auditLog.log({
        actor: authReq.user.userId,
        actorType: 'admin',
        action: 'read',
        resource: RESOURCE,
        resourceId: id,
        description: 'Admin viewed a consent form submission (last-4 projection only)',
        severity: 'info',
      });

      res.status(200).json({ status: 200, data: row });
    }),
  );

  // ─── GET /:id  — fetch one of my submissions ────────────────────────
  router.get(
    '/:id',
    auth() as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const id = req.params.id as string;
      const row = await service.getById(id, authReq.user.userId);
      if (!row) {
        res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Submission not found' });
        return;
      }
      res.status(200).json({ status: 200, data: row });
    }),
  );

  return router;
}
