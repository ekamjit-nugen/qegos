import { Schema, type Model, type Connection } from 'mongoose';
import type {
  IPaymentDocument,
  PaymentStatus,
  PaymentGateway,
  RefundStatus,
} from '../types';
import { VALID_STATUS_TRANSITIONS } from '../types';

const refundEntrySchema = new Schema(
  {
    refundId: { type: String, required: true },
    amount: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number): boolean => Number.isInteger(v) && v > 0,
        message: 'Refund amount must be a positive integer (cents)',
      },
    },
    reason: { type: String, required: true, trim: true },
    gateway: {
      type: String,
      required: true,
      enum: ['stripe', 'payzoo'] as PaymentGateway[],
    },
    gatewayRefundId: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'processing', 'succeeded', 'failed'] as RefundStatus[],
      default: 'pending',
    },
    createdAt: { type: Date, default: Date.now },
    processedAt: { type: Date },
  },
  { _id: false },
);

const paymentMetadataSchema = new Schema(
  {
    clientIp: { type: String },
    userAgent: { type: String },
    deviceType: { type: String, enum: ['mobile', 'web'] },
    browserFingerprint: { type: String },
  },
  { _id: false },
);

const paymentSchema = new Schema<IPaymentDocument>(
  {
    paymentNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      required: [true, 'Order ID is required'],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: [true, 'User ID is required'],
      index: true,
    },
    gateway: {
      type: String,
      required: true,
      enum: ['stripe', 'payzoo'] as PaymentGateway[],
    },
    gatewayTxnId: {
      type: String,
      index: true,
    },
    gatewayCustomerId: { type: String },
    // PAY-INV-01: Unique idempotency key prevents duplicate payments
    idempotencyKey: {
      type: String,
      required: [true, 'Idempotency key is required'],
      unique: true,
      index: true,
    },
    // PAY-INV-02: All amounts as integer cents
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      validate: {
        validator: (v: number): boolean => Number.isInteger(v) && v > 0,
        message: 'Amount must be a positive integer (cents)',
      },
    },
    currency: {
      type: String,
      required: true,
      default: 'AUD',
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      enum: [
        'pending',
        'requires_capture',
        'authorised',
        'captured',
        'succeeded',
        'failed',
        'cancelled',
        'refund_pending',
        'refunded',
        'partially_refunded',
        'disputed',
      ] as PaymentStatus[],
      default: 'pending',
      index: true,
    },
    capturedAmount: {
      type: Number,
      default: 0,
      validate: {
        validator: (v: number): boolean => Number.isInteger(v) && v >= 0,
        message: 'Captured amount must be a non-negative integer (cents)',
      },
    },
    refundedAmount: {
      type: Number,
      default: 0,
      validate: {
        validator: (v: number): boolean => Number.isInteger(v) && v >= 0,
        message: 'Refunded amount must be a non-negative integer (cents)',
      },
    },
    failureCode: { type: String },
    failureMessage: { type: String },
    refunds: { type: [refundEntrySchema], default: [] },
    metadata: { type: paymentMetadataSchema },
    xeroPaymentId: { type: String },
    xeroSynced: { type: Boolean, default: false },
    webhookProcessed: { type: Boolean, default: false },
    webhookProcessedAt: { type: Date },
  },
  { timestamps: true },
);

// Compound indexes for common queries
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ orderId: 1, status: 1 });
paymentSchema.index({ userId: 1, createdAt: -1 });

// Analytics covering indexes (avoid fetching full documents for aggregations)
paymentSchema.index({ status: 1, createdAt: -1, amount: 1 });
paymentSchema.index({ userId: 1, status: 1, amount: 1 });
paymentSchema.index({ orderId: 1, status: 1, amount: 1 });

/**
 * PAY-INV-07: Status transition validator.
 * Strictly one-directional transitions.
 */
paymentSchema.pre('save', function (next) {
  if (this.isModified('status') && !this.isNew) {
    const previousStatus = (this as unknown as { _previousStatus?: PaymentStatus })._previousStatus;
    if (previousStatus) {
      const allowed = VALID_STATUS_TRANSITIONS[previousStatus];
      if (!allowed.includes(this.status)) {
        const err = new Error(
          `Invalid payment status transition: ${previousStatus} -> ${this.status}`,
        );
        next(err);
        return;
      }
    }
  }
  next();
});

/**
 * Track the previous status for transition validation.
 */
paymentSchema.pre('save', function (next) {
  if (this.isModified('status') && !this.isNew) {
    const original = this.$locals as Record<string, unknown>;
    if (!original._previousStatusStored) {
      // The _previousStatus is set by the service layer before calling save
      original._previousStatusStored = true;
    }
  }
  next();
});

/**
 * Factory function to create the Payment model.
 * Consuming app provides the Mongoose connection (Database Isolation rule).
 */
export function createPaymentModel(connection: Connection): Model<IPaymentDocument> {
  return connection.model<IPaymentDocument>('Payment', paymentSchema);
}

/**
 * Validate a status transition without saving.
 * Used by services to check before attempting a transition.
 */
export function isValidTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  const allowed = VALID_STATUS_TRANSITIONS[from];
  return allowed.includes(to);
}

/**
 * Generate a unique payment number.
 * Format: QGS-PAY-XXXX (zero-padded).
 */
export async function generatePaymentNumber(
  PaymentModel: Model<IPaymentDocument>,
): Promise<string> {
  const lastPayment = await PaymentModel.findOne({}, { paymentNumber: 1 })
    .sort({ createdAt: -1 })
    .lean();

  let nextNum = 1;
  if (lastPayment?.paymentNumber) {
    const match = lastPayment.paymentNumber.match(/QGS-PAY-(\d+)/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }

  return `QGS-PAY-${String(nextNum).padStart(4, '0')}`;
}
