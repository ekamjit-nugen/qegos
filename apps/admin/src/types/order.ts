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

export const ORDER_STATUS_LABELS: Record<number, string> = {
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

export const ORDER_STATUS_COLORS: Record<number, string> = {
  [OrderStatus.Pending]: 'default',
  [OrderStatus.DocumentsReceived]: 'blue',
  [OrderStatus.Assigned]: 'cyan',
  [OrderStatus.InProgress]: 'processing',
  [OrderStatus.Review]: 'purple',
  [OrderStatus.Completed]: 'green',
  [OrderStatus.Lodged]: 'geekblue',
  [OrderStatus.Assessed]: 'success',
  [OrderStatus.Cancelled]: 'red',
};

export const ORDER_STATUS_TRANSITIONS: Record<number, number[]> = {
  [OrderStatus.Pending]: [OrderStatus.DocumentsReceived, OrderStatus.Assigned, OrderStatus.Cancelled],
  [OrderStatus.DocumentsReceived]: [OrderStatus.Assigned, OrderStatus.Cancelled],
  [OrderStatus.Assigned]: [OrderStatus.InProgress, OrderStatus.Cancelled],
  [OrderStatus.InProgress]: [OrderStatus.Review, OrderStatus.Cancelled],
  [OrderStatus.Review]: [OrderStatus.InProgress, OrderStatus.Completed, OrderStatus.Cancelled],
  [OrderStatus.Completed]: [OrderStatus.Lodged],
  [OrderStatus.Lodged]: [OrderStatus.Assessed],
  [OrderStatus.Assessed]: [],
  [OrderStatus.Cancelled]: [OrderStatus.Pending],
};

export interface OrderLineItem {
  _id?: string;
  salesItemId: string;
  title: string;
  price: number; // cents
  quantity: number;
  subtotal: number; // cents
  completionStatus?: string;
}

export type SigningStatus = 'not_started' | 'awaiting_client' | 'client_signed' | 'awaiting_admin' | 'completed' | 'declined';

export const SIGNING_STATUS_LABELS: Record<SigningStatus, string> = {
  not_started: 'Not Started',
  awaiting_client: 'Awaiting Client',
  client_signed: 'Client Signed',
  awaiting_admin: 'Awaiting Your Signature',
  completed: 'Fully Signed',
  declined: 'Declined',
};

export const SIGNING_STATUS_COLORS: Record<SigningStatus, string> = {
  not_started: 'default',
  awaiting_client: 'orange',
  client_signed: 'blue',
  awaiting_admin: 'gold',
  completed: 'green',
  declined: 'red',
};

export interface OrderDocument {
  documentId?: string;
  fileName: string;
  fileUrl: string;
  documentType?: string;
  status: 'pending' | 'signed' | 'verified';
  zohoRequestId?: string;
  signingStatus?: SigningStatus;
  clientActionId?: string;
  adminActionId?: string;
  clientSignedAt?: string;
  adminSignedAt?: string;
  clientEmail?: string;
  adminEmail?: string;
}

export interface Order {
  _id: string;
  orderNumber: string;
  userId: string;
  leadId?: string;
  financialYear: string;
  status: number;
  personalDetails: {
    firstName: string;
    lastName: string;
    email?: string;
    mobile?: string;
  };
  documents: OrderDocument[];
  lineItems: OrderLineItem[];
  totalAmount: number; // cents
  discountPercent: number;
  discountAmount: number; // cents
  finalAmount: number; // cents
  processingBy?: string;
  processingByName?: string;
  completionPercent: number;
  eFileStatus?: string;
  eFileReference?: string;
  noaReceived: boolean;
  noaDate?: string;
  orderType?: string;
  notes?: string;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrderListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: number;
  financialYear?: string;
  processingBy?: string;
  eFileStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
