/**
 * Form Mapping — Service Layer
 *
 * Owns lifecycle transitions + invariants for form mappings and their
 * versions. The service never trusts its models directly for mutually
 * exclusive flags (isDefault, status) — Mongo's partial unique index is
 * the last line of defence; the service is the first.
 *
 * All mutations throw `AppError.*` with a `FormMappingErrorCode` so the
 * admin UI can switch on the error code and render an inline tooltip.
 */

import type { Connection, Model, Types } from 'mongoose';
import { AppError } from '@nugen/error-handler';
import type {
  IFormMappingDocument,
  IFormMappingVersionDocument,
  CreateMappingInput,
  UpdateDraftInput,
  ForkVersionInput,
  FormMappingSchema,
} from './formMapping.types';
import { FORM_MAPPING_ERROR_CODES, isValidFinancialYear } from './formMapping.types';
import { validateAuthoredSchema } from './formMapping.schema';

export interface FormMappingServiceDeps {
  FormMappingModel: Model<IFormMappingDocument>;
  FormMappingVersionModel: Model<IFormMappingVersionDocument>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mongoose Model<T> invariance; app passes Model<ISalesDocument>
  SalesModel?: Model<any>;
  connection: Connection;
}

export interface FormMappingListRow {
  _id: unknown;
  salesItemId: unknown;
  financialYear: string;
  title: string;
  description?: string;
  createdBy: unknown;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  defaultVersion: IFormMappingVersionDocument | null;
  latestDraft: IFormMappingVersionDocument | null;
  activeCount: number;
}

export interface FormMappingService {
  listMappings(filter: {
    salesItemId?: string;
    financialYear?: string;
  }): Promise<FormMappingListRow[]>;
  getMapping(
    mappingId: string,
  ): Promise<{ mapping: IFormMappingDocument; versions: IFormMappingVersionDocument[] }>;
  createMapping(
    input: CreateMappingInput,
    actorId: string,
  ): Promise<{ mapping: IFormMappingDocument; version: IFormMappingVersionDocument }>;
  getVersion(mappingId: string, version: number): Promise<IFormMappingVersionDocument>;
  updateDraft(
    mappingId: string,
    version: number,
    input: UpdateDraftInput,
  ): Promise<IFormMappingVersionDocument>;
  forkVersion(
    mappingId: string,
    sourceVersion: number,
    input: ForkVersionInput,
  ): Promise<IFormMappingVersionDocument>;
  publishVersion(
    mappingId: string,
    version: number,
    actorId: string,
  ): Promise<IFormMappingVersionDocument>;
  disableVersion(
    mappingId: string,
    version: number,
    actorId: string,
  ): Promise<IFormMappingVersionDocument>;
  enableVersion(mappingId: string, version: number): Promise<IFormMappingVersionDocument>;
  setDefault(mappingId: string, version: number): Promise<IFormMappingVersionDocument>;
  deleteDraft(mappingId: string, version: number): Promise<void>;
  findDefaultForOrder(
    salesItemId: string,
    financialYear: string,
  ): Promise<{ mapping: IFormMappingDocument; version: IFormMappingVersionDocument } | null>;
}

export function createFormMappingService(deps: FormMappingServiceDeps): FormMappingService {
  const { FormMappingModel, FormMappingVersionModel, connection } = deps;

  // ─── Internal helpers ───────────────────────────────────────────────

  async function mustGetMapping(mappingId: string): Promise<IFormMappingDocument> {
    const m = await FormMappingModel.findById(mappingId);
    if (!m) {
      throw AppError.notFound('Form mapping');
    }
    return m;
  }

  async function mustGetVersion(
    mappingId: string,
    version: number,
  ): Promise<IFormMappingVersionDocument> {
    const v = await FormMappingVersionModel.findOne({ mappingId, version });
    if (!v) {
      throw AppError.notFound(`Form mapping version ${version}`);
    }
    return v;
  }

  function assertSchemaValid(schema: FormMappingSchema): string[] {
    const result = validateAuthoredSchema(schema);
    if (!result.valid) {
      throw new AppError({
        statusCode: 400,
        code: FORM_MAPPING_ERROR_CODES.SCHEMA_INVALID,
        message: 'Authored schema failed validation',
        errors: result.issues.map((i) => ({ field: i.path, message: `[${i.code}] ${i.message}` })),
      });
    }
    return result.steps;
  }

  function assertValidFY(fy: string): void {
    if (!isValidFinancialYear(fy)) {
      throw AppError.badRequest(
        'financialYear must match YYYY-YYYY where the second year = first + 1',
      );
    }
  }

  // ─── API implementation ─────────────────────────────────────────────

  return {
    async listMappings(filter) {
      const q: Record<string, unknown> = {};
      if (filter.salesItemId) {
        q.salesItemId = filter.salesItemId;
      }
      if (filter.financialYear) {
        q.financialYear = filter.financialYear;
      }
      const mappings = await FormMappingModel.find(q).sort({ updatedAt: -1 }).lean();

      // Enrich with default version + latest draft + active count
      const results: FormMappingListRow[] = await Promise.all(
        mappings.map(async (m) => {
          const [defaultVersion, latestDraft, activeCount] = await Promise.all([
            FormMappingVersionModel.findOne({
              mappingId: m._id,
              isDefault: true,
            }),
            FormMappingVersionModel.findOne({
              mappingId: m._id,
              status: 'draft',
            }).sort({ version: -1 }),
            FormMappingVersionModel.countDocuments({
              mappingId: m._id,
              status: 'published',
              lifecycleStatus: 'active',
            }),
          ]);
          return {
            _id: m._id,
            salesItemId: m.salesItemId,
            financialYear: m.financialYear,
            title: m.title,
            description: m.description,
            createdBy: m.createdBy,
            createdAt: m.createdAt,
            updatedAt: m.updatedAt,
            isDeleted: m.isDeleted,
            defaultVersion,
            latestDraft,
            activeCount,
          };
        }),
      );
      return results;
    },

    async getMapping(mappingId) {
      const mapping = await mustGetMapping(mappingId);
      const versions = await FormMappingVersionModel.find({ mappingId: mapping._id }).sort({
        version: 1,
      });
      return { mapping, versions };
    },

    async createMapping(input, actorId) {
      assertValidFY(input.financialYear);
      const stepsFromSchema = assertSchemaValid(input.jsonSchema);
      const uiOrder = input.uiOrder && input.uiOrder.length > 0 ? input.uiOrder : stepsFromSchema;

      // Reject duplicate (salesItemId, FY)
      const existing = await FormMappingModel.findOne({
        salesItemId: input.salesItemId,
        financialYear: input.financialYear,
      });
      if (existing) {
        throw AppError.conflict(
          `A form mapping already exists for salesItem ${input.salesItemId} + FY ${input.financialYear}`,
        );
      }

      const mapping = await FormMappingModel.create({
        salesItemId: input.salesItemId,
        financialYear: input.financialYear,
        title: input.title,
        description: input.description,
        createdBy: actorId,
      });

      const version = await FormMappingVersionModel.create({
        mappingId: mapping._id,
        version: 1,
        status: 'draft',
        lifecycleStatus: null,
        isDefault: false,
        jsonSchema: input.jsonSchema,
        uiOrder,
        notes: input.notes,
      });

      return { mapping, version };
    },

    async getVersion(mappingId, version) {
      await mustGetMapping(mappingId);
      return mustGetVersion(mappingId, version);
    },

    async updateDraft(mappingId, version, input) {
      await mustGetMapping(mappingId);
      const v = await mustGetVersion(mappingId, version);
      if (v.status !== 'draft') {
        throw new AppError({
          statusCode: 409,
          code: FORM_MAPPING_ERROR_CODES.VERSION_PUBLISHED,
          message: `Version ${version} is published and cannot be edited. Fork a new draft instead.`,
        });
      }
      if (input.jsonSchema) {
        const steps = assertSchemaValid(input.jsonSchema);
        v.jsonSchema = input.jsonSchema;
        if (input.uiOrder && input.uiOrder.length > 0) {
          v.uiOrder = input.uiOrder;
        } else {
          v.uiOrder = steps;
        }
      }
      if (input.notes !== undefined) {
        v.notes = input.notes;
      }

      // title/description live on the parent
      if (input.title || input.description !== undefined) {
        const parent = await FormMappingModel.findById(mappingId);
        if (parent) {
          if (input.title) {
            parent.title = input.title;
          }
          if (input.description !== undefined) {
            parent.description = input.description;
          }
          await parent.save();
        }
      }

      await v.save();
      return v;
    },

    async forkVersion(mappingId, sourceVersion, input) {
      await mustGetMapping(mappingId);
      const source = await mustGetVersion(mappingId, sourceVersion);

      // At most one draft per mapping
      const existingDraft = await FormMappingVersionModel.findOne({
        mappingId,
        status: 'draft',
      });
      if (existingDraft) {
        throw new AppError({
          statusCode: 409,
          code: FORM_MAPPING_ERROR_CODES.DRAFT_EXISTS,
          message: `A draft already exists (v${existingDraft.version}). Publish or delete it before forking a new one.`,
        });
      }

      // New version number = max existing + 1. Two concurrent forks can
      // compute the same nextVersion and race on the unique index
      // `{mappingId, version}`; retry a few times on E11000 instead of
      // surfacing a 500. If we exhaust retries the caller gets a clean
      // 409 rather than a duplicate-key stack trace.
      const MAX_ATTEMPTS = 5;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const highest = await FormMappingVersionModel.findOne({ mappingId })
          .sort({ version: -1 })
          .select('version')
          .lean();
        const nextVersion = (highest?.version ?? 0) + 1;

        try {
          const forked = await FormMappingVersionModel.create({
            mappingId: source.mappingId,
            version: nextVersion,
            status: 'draft',
            lifecycleStatus: null,
            isDefault: false,
            jsonSchema: source.jsonSchema,
            uiOrder: [...source.uiOrder],
            notes: input.notes,
          });
          return forked;
        } catch (err: unknown) {
          if ((err as { code?: number }).code === 11000 && attempt < MAX_ATTEMPTS - 1) {
            continue; // another admin claimed this version — recompute
          }
          if ((err as { code?: number }).code === 11000) {
            throw new AppError({
              statusCode: 409,
              code: FORM_MAPPING_ERROR_CODES.DRAFT_EXISTS,
              message: 'Concurrent fork collision — please retry',
            });
          }
          throw err;
        }
      }
      // Unreachable (loop either returns or throws) but keeps TS happy.
      throw new AppError({
        statusCode: 409,
        code: FORM_MAPPING_ERROR_CODES.DRAFT_EXISTS,
        message: 'Fork retry exhausted',
      });
    },

    async publishVersion(mappingId, version, actorId) {
      await mustGetMapping(mappingId);
      const v = await mustGetVersion(mappingId, version);
      if (v.status !== 'draft') {
        throw new AppError({
          statusCode: 409,
          code: FORM_MAPPING_ERROR_CODES.NOT_A_DRAFT,
          message: `Version ${version} is not a draft (current status: ${v.status})`,
        });
      }
      // Re-validate on publish (defence in depth)
      assertSchemaValid(v.jsonSchema);

      v.status = 'published';
      v.lifecycleStatus = 'active';
      v.publishedAt = new Date();
      v.publishedBy = actorId as unknown as Types.ObjectId;
      await v.save();
      return v;
    },

    async disableVersion(mappingId, version, actorId) {
      await mustGetMapping(mappingId);
      const v = await mustGetVersion(mappingId, version);
      if (v.status !== 'published') {
        throw new AppError({
          statusCode: 409,
          code: FORM_MAPPING_ERROR_CODES.NOT_A_PUBLISHED_VERSION,
          message: `Only published versions can be disabled`,
        });
      }
      if (v.lifecycleStatus === 'disabled') {
        throw new AppError({
          statusCode: 409,
          code: FORM_MAPPING_ERROR_CODES.ALREADY_DISABLED,
          message: `Version ${version} is already disabled`,
        });
      }
      if (v.isDefault) {
        throw new AppError({
          statusCode: 409,
          code: FORM_MAPPING_ERROR_CODES.DEFAULT_LOCKED,
          message:
            'Cannot disable the current default version. Set another active version as default first.',
        });
      }
      v.lifecycleStatus = 'disabled';
      v.disabledAt = new Date();
      v.disabledBy = actorId as unknown as Types.ObjectId;
      await v.save();
      return v;
    },

    async enableVersion(mappingId, version) {
      await mustGetMapping(mappingId);
      const v = await mustGetVersion(mappingId, version);
      if (v.status !== 'published') {
        throw new AppError({
          statusCode: 409,
          code: FORM_MAPPING_ERROR_CODES.NOT_A_PUBLISHED_VERSION,
          message: 'Only published versions can be enabled',
        });
      }
      if (v.lifecycleStatus === 'active') {
        throw new AppError({
          statusCode: 409,
          code: FORM_MAPPING_ERROR_CODES.ALREADY_ACTIVE,
          message: `Version ${version} is already active`,
        });
      }
      v.lifecycleStatus = 'active';
      v.disabledAt = null;
      v.disabledBy = null;
      await v.save();
      return v;
    },

    async setDefault(mappingId, version) {
      await mustGetMapping(mappingId);
      const target = await mustGetVersion(mappingId, version);
      if (target.status !== 'published' || target.lifecycleStatus !== 'active') {
        throw new AppError({
          statusCode: 409,
          code: FORM_MAPPING_ERROR_CODES.DISABLED_CANNOT_BE_DEFAULT,
          message: 'Only active published versions can be set as default',
        });
      }
      if (target.isDefault) {
        throw new AppError({
          statusCode: 409,
          code: FORM_MAPPING_ERROR_CODES.ALREADY_DEFAULT,
          message: `Version ${version} is already the default`,
        });
      }

      // Atomic switch: clear any existing default first, then set the new one.
      // The partial unique index guarantees only one isDefault:true row
      // exists per mapping at any moment, so we must unset before set.
      const session = await connection.startSession();
      try {
        await session.withTransaction(async () => {
          await FormMappingVersionModel.updateMany(
            { mappingId, isDefault: true },
            { $set: { isDefault: false } },
            { session },
          );
          await FormMappingVersionModel.updateOne(
            { _id: target._id },
            { $set: { isDefault: true } },
            { session },
          );
        });
      } catch (err) {
        // Standalone Mongo (no replica set) can't use transactions — fall back.
        // This is safe because the partial unique index catches races.
        if (err instanceof Error && /Transaction numbers/.test(err.message)) {
          await FormMappingVersionModel.updateMany(
            { mappingId, isDefault: true },
            { $set: { isDefault: false } },
          );
          await FormMappingVersionModel.updateOne(
            { _id: target._id },
            { $set: { isDefault: true } },
          );
        } else {
          throw err;
        }
      } finally {
        await session.endSession();
      }

      const refreshed = await FormMappingVersionModel.findById(target._id);
      if (!refreshed) {
        throw AppError.notFound('Form mapping version');
      }
      return refreshed;
    },

    async deleteDraft(mappingId, version) {
      await mustGetMapping(mappingId);
      const v = await mustGetVersion(mappingId, version);
      if (v.status !== 'draft') {
        throw new AppError({
          statusCode: 409,
          code: FORM_MAPPING_ERROR_CODES.NOT_DELETABLE,
          message: 'Only drafts can be deleted. Published versions must be disabled instead.',
        });
      }
      await FormMappingVersionModel.deleteOne({ _id: v._id });
    },

    async findDefaultForOrder(salesItemId, financialYear) {
      const mapping = await FormMappingModel.findOne({ salesItemId, financialYear });
      if (!mapping) {
        return null;
      }
      const version = await FormMappingVersionModel.findOne({
        mappingId: mapping._id,
        isDefault: true,
        status: 'published',
        lifecycleStatus: 'active',
      });
      if (!version) {
        return null;
      }
      return { mapping, version };
    },
  };
}
