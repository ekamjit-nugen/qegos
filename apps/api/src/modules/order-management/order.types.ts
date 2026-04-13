import type { Document, Types } from 'mongoose';

// ─── Order Status Enum ──────────────────────────────────────────────────────

export enum OrderStatus {
  Pending = 1,
  DocumentsReceived = 2,
  Assigned = 3,
  InProgress = 4,
  Review = 5,
  Completed = 6,
  Lodged = 7,
  Assessed = 8,
  Cancelled = 9,
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.Pending]: 'Pending',
  [OrderStatus.DocumentsReceived]: 'Documents Received',
  [OrderStatus.Assigned]: 'Assigned',
  [OrderStatus.InProgress]: 'In Progress',
  [OrderStatus.Review]: 'Review',
  [OrderStatus.Completed]: 'Completed',
  [OrderStatus.Lodged]: 'Lodged',
  [OrderStatus.Assessed]: 'Assessed',
  [OrderStatus.Cancelled]: 'Cancelled',
};

/**
 * ORD-INV-01: Status transitions follow the defined state machine.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.Pending]: [OrderStatus.DocumentsReceived, OrderStatus.Cancelled],
  [OrderStatus.DocumentsReceived]: [OrderStatus.Assigned, OrderStatus.Pending, OrderStatus.Cancelled],
  [OrderStatus.Assigned]: [OrderStatus.InProgress, OrderStatus.DocumentsReceived, OrderStatus.Cancelled],
  [OrderStatus.InProgress]: [OrderStatus.Review, OrderStatus.Assigned, OrderStatus.Cancelled],
  [OrderStatus.Review]: [OrderStatus.Completed, OrderStatus.InProgress, OrderStatus.Cancelled],
  [OrderStatus.Completed]: [OrderStatus.Lodged, OrderStatus.Cancelled],
  [OrderStatus.Lodged]: [OrderStatus.Assessed],
  [OrderStatus.Assessed]: [], // Terminal
  [OrderStatus.Cancelled]: [OrderStatus.Pending], // Reopen
};

// ─── Enums ──────────────────────────────────────────────────────────────────

export const MARITAL_STATUSES = ['single', 'married', 'de_facto', 'separated', 'divorced', 'widowed'] as const;

export const E_FILE_STATUSES = ['not_filed', 'pending', 'submitted', 'accepted', 'rejected', 'assessed'] as const;
export type EFileStatus = (typeof E_FILE_STATUSES)[number];

export const APPOINTMENT_TYPES = ['in_person', 'phone', 'video'] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

export const APPOINTMENT_STATUSES = ['scheduled', 'completed', 'no_show', 'cancelled'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const ORDER_TYPES = ['standard', 'amendment'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const LINE_ITEM_COMPLETION_STATUSES = ['not_started', 'in_progress', 'completed', 'cancelled'] as const;
export type LineItemCompletionStatus = (typeof LINE_ITEM_COMPLETION_STATUSES)[number];

export const SALES_CATEGORIES = ['individual', 'business', 'investment', 'other'] as const;
export type SalesCategory = (typeof SALES_CATEGORIES)[number];

// ─── Sub-document Interfaces ────────────────────────────────────────────────

export interface IPersonalDetails {
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  tfnEncrypted?: string;
  tfnLastThree?: string;
  abnNumber?: string;
  address?: {
    street?: string;
    suburb?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  mobile?: string;
  email?: string;
}

export interface ISpouseDetails {
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  tfnEncrypted?: string;
  tfnLastThree?: string;
  mobile?: string;
  email?: string;
}

export interface IDependant {
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  relationship: 'child' | 'student' | 'invalid' | 'other';
  medicareEligible?: boolean;
}

export interface IIncomeDetails {
  employmentIncome?: boolean;
  businessIncome?: boolean;
  rentalIncome?: boolean;
  investmentIncome?: boolean;
  foreignIncome?: boolean;
  capitalGains?: boolean;
  governmentPayments?: boolean;
  superannuationIncome?: boolean;
}

export interface IDeductionDetails {
  workRelatedExpenses?: boolean;
  selfEducation?: boolean;
  vehicleExpenses?: boolean;
  homeOffice?: boolean;
  donations?: boolean;
  privateHealthInsurance?: boolean;
  incomeProtection?: boolean;
}

export const SIGNING_STATUSES = [
  'not_started',
  'awaiting_client',
  'client_signed',
  'awaiting_admin',
  'completed',
  'declined',
] as const;
export type SigningStatus = (typeof SIGNING_STATUSES)[number];

export interface IOrderDocument {
  documentId?: Types.ObjectId;
  fileName: string;
  fileUrl: string;
  documentType?: string;
  status: 'pending' | 'signed' | 'verified';
  zohoRequestId?: string;
  docuSignEnvelopeId?: string;
  // Dual-signature tracking
  signingStatus: SigningStatus;
  clientActionId?: string;
  adminActionId?: string;
  clientSignedAt?: Date;
  adminSignedAt?: Date;
  clientEmail?: string;
  adminEmail?: string;
}

export interface ILineItem {
  salesId: Types.ObjectId;
  title: string;
  price: number; // cents
  quantity: number;
  priceAtCreation: number; // cents — immutable (ORD-INV-02)
  completionStatus: LineItemCompletionStatus;
  completedAt?: Date;
  proratedAmount?: number; // cents
}

export interface IScheduledAppointment {
  date: Date;
  timeSlot: string;
  staffId: Types.ObjectId;
  type: AppointmentType;
  meetingLink?: string;
  status: AppointmentStatus;
}

// ─── Order Interface ────────────────────────────────────────────────────────

export interface IOrder {
  orderNumber: string;
  userId: Types.ObjectId;
  leadId?: Types.ObjectId;
  financialYear: string;
  // Form mapping reference (client-submitted tax filing form)
  formMappingId?: Types.ObjectId;
  formVersionNumber?: number;
  formAnswers?: Record<string, unknown>;
  status: OrderStatus;
  personalDetails: IPersonalDetails;
  maritalStatus?: string;
  spouse?: ISpouseDetails;
  dependants: IDependant[];
  incomeDetails?: IIncomeDetails;
  deductionDetails?: IDeductionDetails;
  questions?: Record<string, unknown>;
  documents: IOrderDocument[];
  lineItems: ILineItem[];
  totalAmount: number; // cents
  discountPercent: number;
  discountAmount: number; // cents
  finalAmount: number; // cents
  processingBy?: Types.ObjectId;
  completionPercent: number;
  scheduledAppointment?: IScheduledAppointment;
  eFileStatus?: EFileStatus;
  eFileReference?: string;
  noaReceived: boolean;
  noaDate?: Date;
  refundOrOwing?: number; // cents (positive = refund, negative = owing)
  xeroInvoiceId?: string;
  xeroInvoiceNumber?: string;
  reviewId?: Types.ObjectId;
  notes?: string;
  orderType: OrderType;
  linkedOrderId?: Types.ObjectId;
  amendmentCount: number;
  isDeleted: boolean;
  deletedAt?: Date;
}

export interface IOrderDocument2 extends IOrder, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sales Interface ────────────────────────────────────────────────────────

export interface ISales {
  title: string;
  description?: string;
  price: number; // cents
  gstInclusive: boolean;
  gstAmount: number; // cents
  category: SalesCategory;
  inputBased: boolean;
  inputBasedType?: string;
  isActive: boolean;
  sortOrder: number;
  xeroAccountCode?: string;
}

export interface ISalesDocument extends ISales, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Query Types ────────────────────────────────────────────────────────────

export interface OrderListQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  status?: number;
  financialYear?: string;
  processingBy?: string;
  userId?: string;
  eFileStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  scopeFilter?: Record<string, unknown>;
}

export interface OrderListResult {
  orders: IOrderDocument2[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Event Types ────────────────────────────────────────────────────────────

export type OrderEvent =
  | 'order.created'
  | 'order.updated'
  | 'order.statusChanged'
  | 'order.assigned'
  | 'order.completed'
  | 'order.cancelled'
  | 'order.lodged';
