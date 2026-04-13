// ─── Form Mapping Client Types ─────────────────────────────────────────────

export interface AvailableFormMapping {
  mappingId: string;
  salesItemId: string;
  financialYear: string;
  title: string;
  description?: string;
  version: number;
  schema: FormMappingSchema;
  uiOrder: string[];
  serviceTitle: string;
  servicePrice: number; // cents
  serviceCategory: string;
}

/**
 * JSON Schema with x-qegos extensions.
 * The schema describes steps and fields for the tax filing form.
 */
export type FormMappingSchema = Record<string, unknown>;

/**
 * x-qegos widget types used in form schema properties.
 */
export type FormMappingWidget =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'multi_select'
  | 'file_upload';

/**
 * Represents a single field extracted from the JSON Schema
 * for rendering in the dynamic form.
 */
export interface FormField {
  key: string;
  label: string;
  widget: FormMappingWidget;
  required: boolean;
  description?: string;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  step?: string;
}

export interface FormFillSubmission {
  mappingId: string;
  versionNumber: number;
  financialYear: string;
  personalDetails: {
    firstName: string;
    lastName: string;
    email?: string;
    mobile?: string;
    dateOfBirth?: string;
  };
  answers: Record<string, unknown>;
}

export interface FormFillResult {
  orderId: string;
  orderNumber: string;
  financialYear: string;
  status: number;
  totalAmount: number;
  finalAmount: number;
}
