export type PaymentStatus =
  | 'pending'
  | 'requires_capture'
  | 'authorised'
  | 'captured'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refund_pending'
  | 'refunded'
  | 'partially_refunded'
  | 'disputed';

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  succeeded: 'green',
  captured: 'green',
  failed: 'red',
  cancelled: 'red',
  pending: 'orange',
  requires_capture: 'orange',
  authorised: 'orange',
  refund_pending: 'blue',
  refunded: 'blue',
  partially_refunded: 'blue',
  disputed: 'purple',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  requires_capture: 'Requires Capture',
  authorised: 'Authorised',
  captured: 'Captured',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
  refund_pending: 'Refund Pending',
  refunded: 'Refunded',
  partially_refunded: 'Partially Refunded',
  disputed: 'Disputed',
};

export type PaymentGateway = 'stripe' | 'payzoo';

export interface Payment {
  _id: string;
  paymentNumber: string;
  orderId: string;
  userId: string;
  gateway: PaymentGateway;
  gatewayTxnId?: string;
  amount: number; // cents
  currency: string;
  status: PaymentStatus;
  capturedAmount: number; // cents
  refundedAmount: number; // cents
  failureCode?: string;
  failureMessage?: string;
  xeroSynced: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: PaymentStatus;
  gateway?: PaymentGateway;
  orderId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
