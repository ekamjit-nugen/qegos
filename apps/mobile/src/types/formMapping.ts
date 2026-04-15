// Form Mapping types for mobile client

export interface AvailableFormMapping {
  mappingId: string;
  salesItemId: string;
  financialYear: string;
  title: string;
  description?: string;
  version: number;
  schema: Record<string, unknown>;
  uiOrder: string[];
  serviceTitle: string;
  servicePrice: number;
  serviceCategory: string;
}

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
  promoCode?: string;
  useCredits?: boolean;
}

export interface FormFillResult {
  orderId: string;
  orderNumber: string;
  financialYear: string;
  status: number;
  totalAmount: number;
  discountAmount?: number;
  creditApplied?: number;
  finalAmount: number;
  promoCode?: string;
}

export interface FormDraft {
  _id: string;
  mappingId: string;
  versionNumber: number;
  financialYear: string;
  currentStep: number;
  serviceTitle: string;
  servicePrice: number;
  formTitle: string;
  answers: Record<string, unknown>;
  personalDetails: {
    firstName?: string;
    lastName?: string;
    email?: string;
    mobile?: string;
    dateOfBirth?: string;
  };
  updatedAt: string;
  createdAt: string;
}

export interface SaveDraftPayload {
  mappingId: string;
  versionNumber: number;
  financialYear: string;
  currentStep: number;
  answers?: Record<string, unknown>;
  personalDetails?: Record<string, unknown>;
  serviceTitle: string;
  servicePrice: number;
  formTitle: string;
}
