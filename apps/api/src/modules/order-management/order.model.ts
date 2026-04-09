import { Schema, type Model, type Connection } from 'mongoose';
import crypto from 'crypto';
import { getConfig } from '../../config/env';
import type { IOrderDocument2 } from './order.types';
import {
  MARITAL_STATUSES,
  E_FILE_STATUSES,
  APPOINTMENT_TYPES,
  APPOINTMENT_STATUSES,
  ORDER_TYPES,
  LINE_ITEM_COMPLETION_STATUSES,
} from './order.types';
import type { ICounterDocument } from '../../database/counter.model';
import { getNextSequence } from '../../database/counter.model';

// ─── TFN Encryption (SEC-INV-09) ───────────────────────────────────────────

export function encryptTfn(tfn: string): string {
  const config = getConfig();
  const key = Buffer.from(config.ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(tfn, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

// ─── Line Item Sub-schema ───────────────────────────────────────────────────

const lineItemSchema = new Schema(
  {
    salesId: { type: Schema.Types.ObjectId, ref: 'Sales', required: true },
    title: { type: String, required: true },
    price: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number): boolean => Number.isInteger(v),
        message: 'Price must be an integer (cents) — ORD-INV-04',
      },
    },
    quantity: { type: Number, required: true, default: 1, min: 1 },
    priceAtCreation: {
      type: Number,
      required: true,
      immutable: true, // ORD-INV-02
      validate: {
        validator: (v: number): boolean => Number.isInteger(v),
        message: 'priceAtCreation must be an integer (cents) — ORD-INV-04',
      },
    },
    completionStatus: {
      type: String,
      enum: LINE_ITEM_COMPLETION_STATUSES,
      default: 'not_started',
    },
    completedAt: { type: Date },
    proratedAmount: {
      type: Number,
      validate: {
        validator: (v: number): boolean => Number.isInteger(v),
        message: 'proratedAmount must be an integer (cents)',
      },
    },
  },
  { _id: true },
);

// ─── Order Schema ───────────────────────────────────────────────────────────

const orderSchema = new Schema<IOrderDocument2>(
  {
    orderNumber: { type: String, unique: true, required: true },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      immutable: true, // ORD-INV-06
      index: true,
    },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', index: true },
    financialYear: { type: String, required: [true, 'Financial year is required'] },
    status: {
      type: Number,
      required: true,
      enum: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      default: 1,
    },
    personalDetails: {
      type: {
        firstName: { type: String, required: true, trim: true },
        lastName: { type: String, required: true, trim: true },
        dateOfBirth: { type: Date },
        gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'] },
        tfnEncrypted: { type: String, select: false },
        tfnLastThree: { type: String },
        abnNumber: { type: String },
        address: {
          street: String,
          suburb: String,
          state: { type: String, enum: ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'] },
          postcode: { type: String, match: /^\d{4}$/ },
          country: { type: String, default: 'AU' },
        },
        mobile: { type: String },
        email: { type: String, lowercase: true, trim: true },
      },
      required: true,
    },
    maritalStatus: { type: String, enum: MARITAL_STATUSES },
    spouse: {
      type: {
        firstName: { type: String, trim: true },
        lastName: { type: String, trim: true },
        dateOfBirth: { type: Date },
        tfnEncrypted: { type: String, select: false },
        tfnLastThree: { type: String },
        mobile: { type: String },
        email: { type: String, lowercase: true, trim: true },
      },
    },
    dependants: [
      {
        firstName: { type: String, trim: true },
        lastName: { type: String, trim: true },
        dateOfBirth: { type: Date },
        relationship: { type: String, enum: ['child', 'student', 'invalid', 'other'] },
        medicareEligible: { type: Boolean },
      },
    ],
    incomeDetails: {
      type: {
        employmentIncome: Boolean,
        businessIncome: Boolean,
        rentalIncome: Boolean,
        investmentIncome: Boolean,
        foreignIncome: Boolean,
        capitalGains: Boolean,
        governmentPayments: Boolean,
        superannuationIncome: Boolean,
      },
    },
    deductionDetails: {
      type: {
        workRelatedExpenses: Boolean,
        selfEducation: Boolean,
        vehicleExpenses: Boolean,
        homeOffice: Boolean,
        donations: Boolean,
        privateHealthInsurance: Boolean,
        incomeProtection: Boolean,
      },
    },
    questions: { type: Schema.Types.Mixed },
    documents: [
      {
        documentId: { type: Schema.Types.ObjectId },
        fileName: { type: String, required: true },
        fileUrl: { type: String, required: true },
        documentType: String,
        status: { type: String, enum: ['pending', 'signed', 'verified'], default: 'pending' },
        zohoRequestId: String,
        docuSignEnvelopeId: String,
      },
    ],
    lineItems: [lineItemSchema],
    totalAmount: {
      type: Number,
      default: 0,
      validate: {
        validator: (v: number): boolean => Number.isInteger(v),
        message: 'totalAmount must be an integer (cents) — ORD-INV-04',
      },
    },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountAmount: {
      type: Number,
      default: 0,
      validate: {
        validator: (v: number): boolean => Number.isInteger(v),
        message: 'discountAmount must be an integer (cents) — ORD-INV-04',
      },
    },
    finalAmount: {
      type: Number,
      default: 0,
      validate: {
        validator: (v: number): boolean => Number.isInteger(v),
        message: 'finalAmount must be an integer (cents) — ORD-INV-04',
      },
    },
    processingBy: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    completionPercent: { type: Number, default: 0, min: 0, max: 100 },
    scheduledAppointment: {
      type: {
        date: { type: Date, required: true },
        timeSlot: { type: String, required: true },
        staffId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        type: { type: String, enum: APPOINTMENT_TYPES, required: true },
        meetingLink: String,
        status: { type: String, enum: APPOINTMENT_STATUSES, default: 'scheduled' },
      },
    },
    eFileStatus: { type: String, enum: E_FILE_STATUSES },
    eFileReference: { type: String },
    noaReceived: { type: Boolean, default: false },
    noaDate: { type: Date },
    refundOrOwing: { type: Number },
    xeroInvoiceId: { type: String },
    xeroInvoiceNumber: { type: String },
    reviewId: { type: Schema.Types.ObjectId, ref: 'ReviewAssignment' },
    notes: { type: String },
    orderType: { type: String, enum: ORDER_TYPES, default: 'standard' },
    linkedOrderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    amendmentCount: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

// ─── Indexes ────────────────────────────────────────────────────────────────

orderSchema.index({ status: 1 });
orderSchema.index({ financialYear: 1 });
orderSchema.index({ orderNumber: 1 }, { unique: true });

// Analytics / dashboard compound indexes
orderSchema.index({ status: 1, isDeleted: 1, createdAt: -1 });
orderSchema.index({ status: 1, isDeleted: 1, updatedAt: -1 });
orderSchema.index({ userId: 1, financialYear: 1 });
orderSchema.index({ processingBy: 1, status: 1, updatedAt: -1 });

// ─── ORD-INV-03: Server-side total recalculation pre-save ───────────────────

orderSchema.pre('save', function (next) {
  if (this.isModified('lineItems') || this.isModified('discountPercent')) {
    const total = this.lineItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    this.totalAmount = total;
    this.discountAmount = Math.round(total * (this.discountPercent / 100));
    this.finalAmount = total - this.discountAmount;
  }
  next();
});

// ─── SEC-INV-09: TFN encryption pre-save ────────────────────────────────────

orderSchema.pre('save', function (next) {
  // Encrypt personal TFN if modified and looks like plaintext (9 digits)
  if (
    this.isModified('personalDetails.tfnEncrypted') &&
    this.personalDetails?.tfnEncrypted &&
    /^\d{9}$/.test(this.personalDetails.tfnEncrypted.replace(/\s/g, ''))
  ) {
    const raw = this.personalDetails.tfnEncrypted.replace(/\s/g, '');
    this.personalDetails.tfnLastThree = raw.slice(-3);
    this.personalDetails.tfnEncrypted = encryptTfn(raw);
  }

  // Encrypt spouse TFN if modified
  if (
    this.isModified('spouse.tfnEncrypted') &&
    this.spouse?.tfnEncrypted &&
    /^\d{9}$/.test(this.spouse.tfnEncrypted.replace(/\s/g, ''))
  ) {
    const raw = this.spouse.tfnEncrypted.replace(/\s/g, '');
    this.spouse.tfnLastThree = raw.slice(-3);
    this.spouse.tfnEncrypted = encryptTfn(raw);
  }

  next();
});

// ─── ORD-INV-09: Soft-delete default filter ─────────────────────────────────

orderSchema.pre('find', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

orderSchema.pre('findOne', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

orderSchema.pre('countDocuments', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

// ─── Auto-increment orderNumber ─────────────────────────────────────────────

/**
 * Generate the next order number in QGS-O-XXXX format.
 * Fix for B-3.1, B-3.13: Uses atomic counter with findOneAndUpdate + $inc
 * to prevent duplicate numbers under concurrent load.
 */
export async function generateOrderNumber(
  _OrderModel: Model<IOrderDocument2>,
  CounterModel?: Model<ICounterDocument>,
): Promise<string> {
  if (!CounterModel) {
    throw new Error('CounterModel is required for atomic order number generation');
  }
  const seq = await getNextSequence(CounterModel, 'order');
  return `QGS-O-${String(seq).padStart(4, '0')}`;
}

/**
 * Factory function to create the Order model.
 */
export function createOrderModel(connection: Connection): Model<IOrderDocument2> {
  return connection.model<IOrderDocument2>('Order', orderSchema);
}
