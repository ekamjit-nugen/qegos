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

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  [OrderStatus.Pending]: 'orange',
  [OrderStatus.DocumentsReceived]: 'orange',
  [OrderStatus.Assigned]: 'blue',
  [OrderStatus.InProgress]: 'blue',
  [OrderStatus.Review]: 'blue',
  [OrderStatus.Completed]: 'green',
  [OrderStatus.Lodged]: 'green',
  [OrderStatus.Assessed]: 'green',
  [OrderStatus.Cancelled]: 'red',
};

export interface OrderLineItem {
  _id: string;
  salesItemId: string;
  title: string;
  price: number;
  quantity: number;
  subtotal: number;
  completionStatus: 'not_started' | 'in_progress' | 'completed' | 'cancelled';
  completedAt?: string;
}

export type SigningStatus =
  | 'not_started'
  | 'awaiting_client'
  | 'client_signed'
  | 'awaiting_admin'
  | 'completed'
  | 'declined';

export const SIGNING_STATUS_LABELS: Record<SigningStatus, string> = {
  not_started: 'Not Started',
  awaiting_client: 'Action Required',
  client_signed: 'You Signed',
  awaiting_admin: 'Awaiting Counter-Signature',
  completed: 'Fully Signed',
  declined: 'Declined',
};

export const SIGNING_STATUS_COLORS: Record<SigningStatus, string> = {
  not_started: 'default',
  awaiting_client: 'orange',
  client_signed: 'blue',
  awaiting_admin: 'blue',
  completed: 'green',
  declined: 'red',
};

export interface OrderDocument {
  documentId: string;
  fileName: string;
  documentType?: string;
  status: 'pending' | 'signed' | 'verified';
  signingStatus?: SigningStatus;
  zohoRequestId?: string;
  clientActionId?: string;
  clientSignedAt?: string;
}

export interface PersonalDetails {
  firstName: string;
  lastName: string;
  email?: string;
  mobile?: string;
  dateOfBirth?: string;
  gender?: string;
}

export interface Order {
  _id: string;
  orderNumber: string;
  userId: string;
  financialYear: string;
  status: OrderStatus;
  personalDetails: PersonalDetails;
  lineItems: OrderLineItem[];
  documents: OrderDocument[];
  totalAmount: number;
  discountPercent: number;
  discountAmount: number;
  finalAmount: number;
  promoCode?: string;
  creditApplied?: number;
  completionPercent: number;
  processingByName?: string;
  paymentStatus?: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded';
  eFileStatus?: 'not_filed' | 'pending' | 'submitted' | 'accepted' | 'rejected' | 'assessed';
  eFileReference?: string;
  eFiledAt?: string;
  noaReceived?: boolean;
  noaDate?: string;
  refundOrOwing?: number;
  formAnswers?: Record<string, unknown>;
  scheduledAppointment?: {
    date: string;
    timeSlot: string;
    staffId: string;
    type: string;
    meetingLink?: string;
    status: string;
  };
  createdAt: string;
  updatedAt: string;
}
