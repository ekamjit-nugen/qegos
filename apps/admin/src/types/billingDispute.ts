export type DisputeType =
  | 'overcharge'
  | 'service_not_delivered'
  | 'quality_issue'
  | 'incorrect_amount'
  | 'duplicate_charge'
  | 'unauthorised';

export type DisputeStatus =
  | 'raised'
  | 'investigating'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'completed';

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  raised: 'Raised',
  investigating: 'Investigating',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  completed: 'Completed',
};

export const DISPUTE_STATUS_COLORS: Record<DisputeStatus, string> = {
  raised: 'orange',
  investigating: 'processing',
  pending_approval: 'purple',
  approved: 'green',
  rejected: 'red',
  completed: 'default',
};

export const DISPUTE_TYPE_LABELS: Record<DisputeType, string> = {
  overcharge: 'Overcharge',
  service_not_delivered: 'Service Not Delivered',
  quality_issue: 'Quality Issue',
  incorrect_amount: 'Incorrect Amount',
  duplicate_charge: 'Duplicate Charge',
  unauthorised: 'Unauthorised',
};

export interface BillingDispute {
  _id: string;
  ticketId?: string;
  orderId: string;
  paymentId: string;
  disputeType: DisputeType;
  disputedAmount: number; // cents
  clientStatement: string;
  staffAssessment?: string;
  resolution?: string;
  resolvedAmount?: number; // cents
  status: DisputeStatus;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DisputeListQuery {
  page?: number;
  limit?: number;
  status?: DisputeStatus;
  disputeType?: DisputeType;
}
