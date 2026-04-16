import { Schema, type Model, type Connection } from 'mongoose';
import type { ICounterDocument } from '../../database/counter.model';
import { getNextSequence } from '../../database/counter.model';
import type { ILeadDocument } from './lead.types';
import {
  LEAD_SOURCES,
  LEAD_PRIORITIES,
  PREFERRED_LANGUAGES,
  PREFERRED_CONTACTS,
  AU_STATES,
  MARITAL_STATUSES,
  EMPLOYMENT_TYPES,
  LOST_REASONS,
} from './lead.types';

const leadSchema = new Schema<ILeadDocument>(
  {
    leadNumber: {
      type: String,
      unique: true,
      required: true,
    },
    source: {
      type: String,
      required: [true, 'Lead source is required'],
      enum: {
        values: LEAD_SOURCES,
        message: 'Invalid lead source: {VALUE}',
      },
    },
    firstName: { type: String, required: [true, 'First name is required'], trim: true },
    lastName: { type: String, trim: true },
    mobile: {
      type: String,
      required: [true, 'Mobile number is required'],
      trim: true,
      index: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
      index: true,
    },
    preferredLanguage: {
      type: String,
      enum: PREFERRED_LANGUAGES,
    },
    preferredContact: {
      type: String,
      enum: PREFERRED_CONTACTS,
    },
    suburb: { type: String, trim: true },
    state: {
      type: String,
      enum: AU_STATES,
    },
    postcode: {
      type: String,
      match: [/^\d{4}$/, 'Must be a 4-digit Australian postcode'],
    },
    financialYear: { type: String, trim: true },
    serviceInterest: [{ type: Schema.Types.ObjectId, ref: 'Sales' }],
    estimatedValue: {
      type: Number,
      validate: {
        validator: function (v: number): boolean {
          return Number.isInteger(v);
        },
        message: 'estimatedValue must be an integer (cents) — LM-INV-12',
      },
    },
    maritalStatus: {
      type: String,
      enum: MARITAL_STATUSES,
    },
    hasSpouse: { type: Boolean },
    numberOfDependants: { type: Number, min: 0 },
    employmentType: {
      type: String,
      enum: EMPLOYMENT_TYPES,
    },
    hasRentalProperty: { type: Boolean },
    hasSharePortfolio: { type: Boolean },
    hasForeignIncome: { type: Boolean },
    status: {
      type: Number,
      required: true,
      enum: [1, 2, 3, 4, 5, 6, 7, 8],
      default: 1,
    },
    priority: {
      type: String,
      required: true,
      enum: LEAD_PRIORITIES,
      default: 'warm',
    },
    score: { type: Number, default: 0, min: 0, max: 100 },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    nextAction: { type: String },
    nextActionDate: { type: Date, index: true },
    followUpCount: { type: Number, default: 0 },
    lastContactedAt: { type: Date },
    isConverted: { type: Boolean, default: false },
    convertedOrderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    convertedUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    lostReason: {
      type: String,
      enum: LOST_REASONS,
    },
    lostReasonNote: { type: String },
    tags: [{ type: String, trim: true }],
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign' },
    referralCode: { type: String },
    costPerLead: {
      type: Number,
      validate: {
        validator: function (v: number): boolean {
          return Number.isInteger(v);
        },
        message: 'costPerLead must be an integer (cents)',
      },
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

// ─── Indexes ────────────────────────────────────────────────────────────────

leadSchema.index({ status: 1 });
leadSchema.index({ priority: 1 });
leadSchema.index({ score: -1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index(
  { firstName: 'text', lastName: 'text', mobile: 'text', email: 'text' },
  { name: 'lead_text_search' },
);

// Analytics / dashboard compound indexes
leadSchema.index({ status: 1, isDeleted: 1, createdAt: -1 });
leadSchema.index({ assignedTo: 1, status: 1, isDeleted: 1 });
leadSchema.index({ campaignId: 1, isDeleted: 1, isConverted: 1 });

// ─── LM-INV-09: Mobile normalization pre-save ──────────────────────────────

leadSchema.pre('save', function (next) {
  if (this.isModified('mobile') && this.mobile) {
    // Normalize Australian mobile: "0412345678" → "+61412345678"
    const mobile = this.mobile.trim();
    if (/^04\d{8}$/.test(mobile)) {
      this.mobile = `+61${mobile.substring(1)}`;
    }
  }
  next();
});

// ─── LM-INV-10: Soft-delete default filter ─────────────────────────────────

leadSchema.pre('find', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

leadSchema.pre('findOne', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

leadSchema.pre('countDocuments', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

// ─── Auto-increment leadNumber ──────────────────────────────────────────────

/**
 * Generate the next lead number in QGS-L-XXXX format.
 * Fix for B-3.1: Uses atomic counter with findOneAndUpdate + $inc
 * to prevent duplicate numbers under concurrent load.
 */
export async function generateLeadNumber(
  _LeadModel: Model<ILeadDocument>,
  CounterModel?: Model<ICounterDocument>,
): Promise<string> {
  if (!CounterModel) {
    throw new Error('CounterModel is required for atomic lead number generation');
  }
  const seq = await getNextSequence(CounterModel, 'lead');
  return `QGS-L-${String(seq).padStart(4, '0')}`;
}

/**
 * Factory function to create the Lead model.
 */
export function createLeadModel(connection: Connection): Model<ILeadDocument> {
  return connection.model<ILeadDocument>('Lead', leadSchema);
}
