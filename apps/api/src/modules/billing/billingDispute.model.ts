import { Schema, type Model, type Connection } from 'mongoose';
import type {
  IBillingDisputeDocument,
  DisputeType,
  DisputeResolution,
  DisputeStatus,
} from './billingDispute.types';

const DISPUTE_TYPES: DisputeType[] = [
  'overcharge',
  'service_not_delivered',
  'quality_issue',
  'incorrect_amount',
  'duplicate_charge',
  'unauthorised',
];

const DISPUTE_RESOLUTIONS: DisputeResolution[] = [
  'full_refund',
  'partial_refund',
  'credit_issued',
  'no_action',
  'service_redo',
  'discount_applied',
];

const DISPUTE_STATUSES: DisputeStatus[] = [
  'raised',
  'investigating',
  'pending_approval',
  'approved',
  'rejected',
  'completed',
];

const billingDisputeSchema = new Schema<IBillingDisputeDocument>(
  {
    ticketId: {
      type: Schema.Types.ObjectId,
      ref: 'SupportTicket',
    },
    orderId: {
      type: Schema.Types.ObjectId,
      required: [true, 'Order ID is required'],
      index: true,
    },
    paymentId: {
      type: Schema.Types.ObjectId,
      required: [true, 'Payment ID is required'],
      index: true,
    },
    disputeType: {
      type: String,
      required: [true, 'Dispute type is required'],
      enum: DISPUTE_TYPES,
    },
    disputedAmount: {
      type: Number,
      required: [true, 'Disputed amount is required'],
      validate: {
        validator: (v: number): boolean => Number.isInteger(v) && v > 0,
        message: 'Disputed amount must be a positive integer (cents)',
      },
    },
    clientStatement: {
      type: String,
      required: [true, 'Client statement is required'],
      trim: true,
      maxlength: [2000, 'Client statement must be at most 2000 characters'],
    },
    staffAssessment: {
      type: String,
      trim: true,
      maxlength: [2000, 'Staff assessment must be at most 2000 characters'],
    },
    resolution: {
      type: String,
      enum: DISPUTE_RESOLUTIONS,
    },
    resolvedAmount: {
      type: Number,
      validate: {
        validator: (v: number): boolean => Number.isInteger(v) && v >= 0,
        message: 'Resolved amount must be a non-negative integer (cents)',
      },
    },
    status: {
      type: String,
      required: true,
      enum: DISPUTE_STATUSES,
      default: 'raised',
      index: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
    },
    xeroAdjustmentMade: {
      type: Boolean,
      default: false,
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

// Compound indexes for common queries
billingDisputeSchema.index({ orderId: 1, status: 1 });
billingDisputeSchema.index({ paymentId: 1 });
billingDisputeSchema.index({ status: 1, createdAt: -1 });

// Soft-delete default filter
billingDisputeSchema.pre('find', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

billingDisputeSchema.pre('findOne', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

billingDisputeSchema.pre('countDocuments', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

/**
 * Factory function to create the BillingDispute model.
 */
export function createBillingDisputeModel(connection: Connection): Model<IBillingDisputeDocument> {
  return connection.model<IBillingDisputeDocument>('BillingDispute', billingDisputeSchema);
}
