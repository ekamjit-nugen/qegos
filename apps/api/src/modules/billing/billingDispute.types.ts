import type { Document, Types } from 'mongoose';

export type DisputeType =
  | 'overcharge'
  | 'service_not_delivered'
  | 'quality_issue'
  | 'incorrect_amount'
  | 'duplicate_charge'
  | 'unauthorised';

export type DisputeResolution =
  | 'full_refund'
  | 'partial_refund'
  | 'credit_issued'
  | 'no_action'
  | 'service_redo'
  | 'discount_applied';

export type DisputeStatus =
  | 'raised'
  | 'investigating'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'completed';

export interface IBillingDispute {
  ticketId?: Types.ObjectId;
  orderId: Types.ObjectId;
  paymentId: Types.ObjectId;
  disputeType: DisputeType;
  disputedAmount: number; // integer cents
  clientStatement: string;
  staffAssessment?: string;
  resolution?: DisputeResolution;
  resolvedAmount?: number; // integer cents
  status: DisputeStatus;
  approvedBy?: Types.ObjectId;
  xeroAdjustmentMade: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
}

export interface IBillingDisputeDocument extends IBillingDispute, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Valid status transitions for billing disputes.
 */
export const VALID_DISPUTE_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  raised: ['investigating', 'rejected'],
  investigating: ['pending_approval', 'rejected'],
  pending_approval: ['approved', 'rejected'],
  approved: ['completed'],
  rejected: [],
  completed: [],
};
