/**
 * Form Mapping — Admin Types
 *
 * Mirror of apps/api/src/modules/form-mapping/formMapping.types.ts for the
 * admin UI. Kept as a separate file (rather than importing across workspaces)
 * because the admin app uses Next.js's own build, not the API's tsconfig.
 */

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

export type FormMappingSchema = Record<string, unknown>;

export interface FormMapping {
  _id: string;
  salesItemId: string;
  financialYear: string;
  title: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
}

export interface FormMappingVersion {
  _id: string;
  mappingId: string;
  version: number;
  status: FormMappingVersionStatus;
  lifecycleStatus: FormMappingLifecycleStatus | null;
  isDefault: boolean;
  schema: FormMappingSchema;
  uiOrder: string[];
  publishedAt: string | null;
  publishedBy: string | null;
  disabledAt: string | null;
  disabledBy: string | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FormMappingListRow {
  _id: string;
  salesItemId: string;
  financialYear: string;
  title: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  defaultVersion: FormMappingVersion | null;
  latestDraft: FormMappingVersion | null;
  activeCount: number;
}

export interface FormMappingDetail {
  mapping: FormMapping;
  versions: FormMappingVersion[];
}

export interface CreateMappingInput {
  salesItemId: string;
  financialYear: string;
  title: string;
  description?: string;
  schema: FormMappingSchema;
  uiOrder?: string[];
  notes?: string;
}

export interface UpdateDraftInput {
  title?: string;
  description?: string;
  schema?: FormMappingSchema;
  uiOrder?: string[];
  notes?: string;
}

export interface ValidateSchemaIssue {
  path: string;
  code: string;
  message: string;
}

export interface ValidateSchemaResult {
  valid: boolean;
  issues: ValidateSchemaIssue[];
  steps: string[];
  fieldKeys: string[];
}

/** FY helper shared with server. */
export function isValidFinancialYear(fy: string): boolean {
  const match = /^(\d{4})-(\d{4})$/.exec(fy);
  if (!match) return false;
  const start = parseInt(match[1] ?? '0', 10);
  const end = parseInt(match[2] ?? '0', 10);
  return end === start + 1;
}
