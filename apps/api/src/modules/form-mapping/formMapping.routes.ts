/**
 * Form Mapping — Express Router
 *
 * All routes mounted under /api/v1/form-mappings. Mutations require the
 * form_mappings RBAC permission and are audit-logged.
 */

import { Router, type Request, type Response, type RequestHandler } from 'express';
import type { Model } from 'mongoose';
import { asyncHandler } from '@nugen/error-handler';
import { validate } from '@nugen/validator';
import * as _auditLog from '@nugen/audit-log';
import type { AuditAction, AuditActorType } from '@nugen/audit-log';
import type { CheckPermissionFn } from '@nugen/rbac';
import { getRequestId } from '../../lib/requestContext';

import type { IFormMappingDocument, IFormMappingVersionDocument } from './formMapping.types';
import { createFormMappingService } from './formMapping.service';
import { validateAuthoredSchema } from './formMapping.schema';
import {
  listMappingsValidation,
  createMappingValidation,
  mappingIdParam,
  versionParams,
  updateDraftValidation,
  forkVersionValidation,
  validateSchemaValidation,
} from './formMapping.validators';

// Wrap audit log to swallow failures (pattern from order.routes.ts)
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

export interface FormMappingRouteDeps {
  FormMappingModel: Model<IFormMappingDocument>;
  FormMappingVersionModel: Model<IFormMappingVersionDocument>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mongoose Model<T> invariance; app passes Model<ISalesDocument>
  SalesModel?: Model<any>;
  connection: import('mongoose').Connection;
  authenticate: () => RequestHandler;
  checkPermission: CheckPermissionFn;
}

const RESOURCE = 'form_mappings';

// The HTTP surface continues to speak in terms of `schema` (ergonomic for
// clients authoring a JSON Schema document). Internally, the Mongoose model
// stores the field as `jsonSchema` to avoid collision with
// Document.prototype.schema. These helpers translate at the boundary.
function renameSchemaToJsonSchema<T extends Record<string, unknown>>(body: T): T {
  if (body && typeof body === 'object' && 'schema' in body) {
    const { schema, ...rest } = body as Record<string, unknown>;
    return { ...rest, jsonSchema: schema } as unknown as T;
  }
  return body;
}

function renameJsonSchemaToSchema(
  v: IFormMappingVersionDocument | null | undefined,
): Record<string, unknown> | null {
  if (!v) {
    return null;
  }
  const obj =
    typeof (v as { toObject?: () => unknown }).toObject === 'function'
      ? (v as { toObject: () => Record<string, unknown> }).toObject()
      : { ...(v as unknown as Record<string, unknown>) };
  if ('jsonSchema' in obj) {
    const { jsonSchema, ...rest } = obj;
    return { ...rest, schema: jsonSchema };
  }
  return obj;
}

function renameJsonSchemaToSchemaList(
  versions: IFormMappingVersionDocument[],
): Record<string, unknown>[] {
  return versions.map((v) => renameJsonSchemaToSchema(v) as Record<string, unknown>);
}

export function createFormMappingRoutes(deps: FormMappingRouteDeps): Router {
  const router = Router();
  const { authenticate: auth, checkPermission: check } = deps;
  const service = createFormMappingService({
    FormMappingModel: deps.FormMappingModel,
    FormMappingVersionModel: deps.FormMappingVersionModel,
    SalesModel: deps.SalesModel,
    connection: deps.connection,
  });

  function actorTypeFromReq(_req: AuthenticatedRequest): AuditActorType {
    // userType → role name: all mutating routes here require
    // form_mappings:update which in default roles is granted only to
    // super_admin + admin. Safer default = super_admin; refine in Phase 2.
    return 'super_admin';
  }

  function writeAudit(
    req: AuthenticatedRequest,
    action: AuditAction,
    resourceId: string,
    description: string,
  ): void {
    auditLog.log({
      actor: req.user.userId,
      actorType: actorTypeFromReq(req),
      action,
      resource: RESOURCE,
      resourceId,
      description,
      severity: 'info',
    });
  }

  // ─── List mappings ──────────────────────────────────────────────────

  router.get(
    '/',
    auth() as never,
    check(RESOURCE, 'read') as never,
    ...validate(listMappingsValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { salesItemId, financialYear } = req.query as Record<string, string | undefined>;
      const data = await service.listMappings({ salesItemId, financialYear });
      // Translate embedded version docs (defaultVersion, latestDraft) at the boundary.
      const rows = data.map((r) => ({
        ...r,
        defaultVersion: r.defaultVersion ? renameJsonSchemaToSchema(r.defaultVersion) : null,
        latestDraft: r.latestDraft ? renameJsonSchemaToSchema(r.latestDraft) : null,
      }));
      res.status(200).json({ status: 200, data: rows });
    }),
  );

  // ─── Create mapping ─────────────────────────────────────────────────

  router.post(
    '/',
    auth() as never,
    check(RESOURCE, 'create') as never,
    ...validate(createMappingValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const body = renameSchemaToJsonSchema(
        req.body as Record<string, unknown>,
      ) as unknown as Parameters<typeof service.createMapping>[0];
      const { mapping, version } = await service.createMapping(body, authReq.user.userId);
      writeAudit(
        authReq,
        'create',
        mapping._id.toString(),
        `Created form mapping "${mapping.title}" v1 (draft)`,
      );
      res.status(201).json({
        status: 201,
        data: { mapping, version: renameJsonSchemaToSchema(version) },
      });
    }),
  );

  // ─── Get mapping with all versions ──────────────────────────────────

  router.get(
    '/:mappingId',
    auth() as never,
    check(RESOURCE, 'read') as never,
    ...validate(mappingIdParam()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const data = await service.getMapping(req.params.mappingId as string);
      res.status(200).json({
        status: 200,
        data: {
          mapping: data.mapping,
          versions: renameJsonSchemaToSchemaList(data.versions),
        },
      });
    }),
  );

  // ─── Get single version ─────────────────────────────────────────────

  router.get(
    '/:mappingId/versions/:version',
    auth() as never,
    check(RESOURCE, 'read') as never,
    ...validate(versionParams()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const v = await service.getVersion(
        req.params.mappingId as string,
        Number(req.params.version),
      );
      res.status(200).json({ status: 200, data: renameJsonSchemaToSchema(v) });
    }),
  );

  // ─── Update draft ───────────────────────────────────────────────────

  router.patch(
    '/:mappingId/versions/:version',
    auth() as never,
    check(RESOURCE, 'update') as never,
    ...validate(updateDraftValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const body = renameSchemaToJsonSchema(req.body as Record<string, unknown>) as Parameters<
        typeof service.updateDraft
      >[2];
      const v = await service.updateDraft(
        req.params.mappingId as string,
        Number(req.params.version),
        body,
      );
      writeAudit(authReq, 'update', v._id.toString(), `Updated draft v${v.version}`);
      res.status(200).json({ status: 200, data: renameJsonSchemaToSchema(v) });
    }),
  );

  // ─── Fork a new draft from a source version ─────────────────────────

  router.post(
    '/:mappingId/versions',
    auth() as never,
    check(RESOURCE, 'update') as never,
    ...validate(forkVersionValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { sourceVersion, notes } = req.body as { sourceVersion: number; notes?: string };
      const v = await service.forkVersion(req.params.mappingId as string, sourceVersion, { notes });
      writeAudit(
        authReq,
        'update',
        v._id.toString(),
        `Forked v${sourceVersion} → draft v${v.version}`,
      );
      res.status(201).json({ status: 201, data: renameJsonSchemaToSchema(v) });
    }),
  );

  // ─── Publish ─────────────────────────────────────────────────────────

  router.post(
    '/:mappingId/versions/:version/publish',
    auth() as never,
    check(RESOURCE, 'update') as never,
    ...validate(versionParams()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const v = await service.publishVersion(
        req.params.mappingId as string,
        Number(req.params.version),
        authReq.user.userId,
      );
      writeAudit(authReq, 'approve', v._id.toString(), `Published v${v.version}`);
      res.status(200).json({ status: 200, data: renameJsonSchemaToSchema(v) });
    }),
  );

  // ─── Disable ─────────────────────────────────────────────────────────

  router.post(
    '/:mappingId/versions/:version/disable',
    auth() as never,
    check(RESOURCE, 'update') as never,
    ...validate(versionParams()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const v = await service.disableVersion(
        req.params.mappingId as string,
        Number(req.params.version),
        authReq.user.userId,
      );
      writeAudit(authReq, 'config_change', v._id.toString(), `Disabled v${v.version}`);
      res.status(200).json({ status: 200, data: renameJsonSchemaToSchema(v) });
    }),
  );

  // ─── Enable ──────────────────────────────────────────────────────────

  router.post(
    '/:mappingId/versions/:version/enable',
    auth() as never,
    check(RESOURCE, 'update') as never,
    ...validate(versionParams()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const v = await service.enableVersion(
        req.params.mappingId as string,
        Number(req.params.version),
      );
      writeAudit(authReq, 'config_change', v._id.toString(), `Enabled v${v.version}`);
      res.status(200).json({ status: 200, data: renameJsonSchemaToSchema(v) });
    }),
  );

  // ─── Set as default ──────────────────────────────────────────────────

  router.post(
    '/:mappingId/versions/:version/set-default',
    auth() as never,
    check(RESOURCE, 'update') as never,
    ...validate(versionParams()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const v = await service.setDefault(
        req.params.mappingId as string,
        Number(req.params.version),
      );
      writeAudit(authReq, 'config_change', v._id.toString(), `Set v${v.version} as default`);
      res.status(200).json({ status: 200, data: renameJsonSchemaToSchema(v) });
    }),
  );

  // ─── Delete draft ────────────────────────────────────────────────────

  router.delete(
    '/:mappingId/versions/:version',
    auth() as never,
    check(RESOURCE, 'delete') as never,
    ...validate(versionParams()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const mappingId = req.params.mappingId as string;
      const version = Number(req.params.version);
      await service.deleteDraft(mappingId, version);
      writeAudit(authReq, 'delete', `${mappingId}:${version}`, `Deleted draft v${version}`);
      res.status(200).json({ status: 200, data: { deleted: true } });
    }),
  );

  // ─── Validate schema (no persist — for live preview in editor) ──────

  router.post(
    '/validate-schema',
    auth() as never,
    check(RESOURCE, 'read') as never,
    ...validate(validateSchemaValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const result = validateAuthoredSchema(req.body.schema);
      res.status(200).json({ status: 200, data: result });
    }),
  );

  return router;
}
