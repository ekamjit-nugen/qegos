/**
 * Form Mapping — Types & Constants
 *
 * A Form Mapping describes the stepper and fields a client must fill when
 * creating an order. Mappings are parented by (salesItemId, financialYear) and
 * immutably versioned. An order pins the exact mapping version it was created
 * against so historical data can never be corrupted by later edits.
 *
 * See /Users/lovishmahajan/.claude/plans/glowing-frolicking-bunny.md for the
 * full phase plan.
 */

import type { Document, Types } from 'mongoose';

// ─── Enum-style unions (kept as string unions for JSON friendliness) ──────

export type FormMappingVersionStatus = 'draft' | 'published';

export type FormMappingLifecycleStatus = 'active' | 'disabled';

export const FORM_MAPPING_WIDGETS = [
  'text',
  'textarea',
  'number',
  'currency',
  'date',
  'select',
  'radio',
  'checkbox',
  'multi_select',
  'file_upload',
] as const;

export type FormMappingWidget = (typeof FORM_MAPPING_WIDGETS)[number];

// ─── Error codes (used in AppError.conflict / badRequest) ────────────────

export const FORM_MAPPING_ERROR_CODES = {
  DRAFT_EXISTS: 'DRAFT_EXISTS',
  VERSION_PUBLISHED: 'VERSION_PUBLISHED',
  DEFAULT_LOCKED: 'DEFAULT_LOCKED',
  NOT_DELETABLE: 'NOT_DELETABLE',
  NOT_A_DRAFT: 'NOT_A_DRAFT',
  NOT_A_PUBLISHED_VERSION: 'NOT_A_PUBLISHED_VERSION',
  SCHEMA_INVALID: 'SCHEMA_INVALID',
  ALREADY_DEFAULT: 'ALREADY_DEFAULT',
  ALREADY_DISABLED: 'ALREADY_DISABLED',
  ALREADY_ACTIVE: 'ALREADY_ACTIVE',
  DISABLED_CANNOT_BE_DEFAULT: 'DISABLED_CANNOT_BE_DEFAULT',
} as const;

export type FormMappingErrorCode =
  (typeof FORM_MAPPING_ERROR_CODES)[keyof typeof FORM_MAPPING_ERROR_CODES];

// ─── Core parent: IFormMapping ───────────────────────────────────────────

export interface IFormMapping {
  salesItemId: Types.ObjectId;
  financialYear: string; // e.g. "2025-2026"
  title: string;
  description?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  deletedAt?: Date;
}

export interface IFormMappingDocument extends IFormMapping, Document {
  _id: Types.ObjectId;
}

// ─── Version: IFormMappingVersion ────────────────────────────────────────

/**
 * The shape of a single authored form mapping JSON Schema.
 *
 * This is a strict subset of JSON Schema draft-07 with x-qegos extensions.
 * We store it as an opaque object (validated via AJV meta-schema on write),
 * but expose a helpful type alias.
 */
export type FormMappingSchema = Record<string, unknown>;

// NOTE: the field that holds the authored JSON Schema document is named
// `jsonSchema` (not `schema`). Mongoose's Document.prototype.schema is a
// reserved accessor used internally by SchemaArray.cast → doc.schema.indexedPaths().
// Defining a path named `schema` shadows that accessor and crashes every
// .save() call the moment any array path (e.g. uiOrder) is cast.
export interface IFormMappingVersion {
  mappingId: Types.ObjectId;
  version: number; // monotonic per mappingId, starts at 1
  status: FormMappingVersionStatus;
  lifecycleStatus: FormMappingLifecycleStatus | null; // null for drafts
  isDefault: boolean;
  jsonSchema: FormMappingSchema;
  uiOrder: string[]; // ordered step ids (from x-qegos.steps on root)
  publishedAt: Date | null;
  publishedBy: Types.ObjectId | null;
  disabledAt: Date | null;
  disabledBy: Types.ObjectId | null;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IFormMappingVersionDocument extends IFormMappingVersion, Document {
  _id: Types.ObjectId;
}

// ─── Service DTOs ─────────────────────────────────────────────────────────

export interface CreateMappingInput {
  salesItemId: string;
  financialYear: string;
  title: string;
  description?: string;
  jsonSchema: FormMappingSchema;
  uiOrder?: string[];
  notes?: string;
}

export interface UpdateDraftInput {
  title?: string;
  description?: string;
  jsonSchema?: FormMappingSchema;
  uiOrder?: string[];
  notes?: string;
}

export interface ForkVersionInput {
  notes?: string;
}

// ─── Helpers / guards ─────────────────────────────────────────────────────

/**
 * FY format check. Accepts "YYYY-YYYY" where the second year == first + 1.
 * Example: "2025-2026" ok, "2025-2027" rejected, "25-26" rejected.
 */
export function isValidFinancialYear(fy: string): boolean {
  const match = /^(\d{4})-(\d{4})$/.exec(fy);
  if (!match) {
    return false;
  }
  const start = parseInt(match[1] ?? '0', 10);
  const end = parseInt(match[2] ?? '0', 10);
  return end === start + 1;
}
