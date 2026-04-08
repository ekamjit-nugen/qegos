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

export interface OrderDocument {
  documentId: string;
  fileName: string;
  documentType?: string;
  status: 'pending' | 'signed' | 'verified';
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
  completionPercent: number;
  processingByName?: string;
  eFileStatus?: string;
  eFileReference?: string;
  noaReceived?: boolean;
  createdAt: string;
  updatedAt: string;
}
