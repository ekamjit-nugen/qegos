import { Schema, type Model, type Connection } from 'mongoose';
import type { ITaxReturnResultDocument } from './taxEngine.types';
import {
  TAX_RESULT_SOURCES,
  RETURN_TYPES,
  LODGEMENT_METHODS,
  ATO_AMENDMENT_STATUSES,
} from './taxEngine.types';

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const incomeSchema = new Schema(
  {
    employment: { type: Number, default: 0 },
    business: { type: Number, default: 0 },
    rental: { type: Number, default: 0 },
    interest: { type: Number, default: 0 },
    dividends: { type: Number, default: 0 },
    frankingCredits: { type: Number, default: 0 },
    capitalGains: { type: Number, default: 0 },
    foreign: { type: Number, default: 0 },
    government: { type: Number, default: 0 },
    superannuation: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false },
);

const deductionsSchema = new Schema(
  {
    workRelated: { type: Number, default: 0 },
    selfEducation: { type: Number, default: 0 },
    vehicle: { type: Number, default: 0 },
    homeOffice: { type: Number, default: 0 },
    donations: { type: Number, default: 0 },
    incomeProtection: { type: Number, default: 0 },
    accounting: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false },
);

const offsetsSchema = new Schema(
  {
    lito: { type: Number, default: 0 },
    sapto: { type: Number, default: 0 },
    franking: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false },
);

// ─── Main Schema ──────────────────────────────────────────────────────────────

const taxReturnResultSchema = new Schema<ITaxReturnResultDocument>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    financialYear: { type: String, required: true, trim: true },
    rulesSnapshotId: { type: String, required: true },
    source: { type: String, required: true, enum: [...TAX_RESULT_SOURCES] },
    sourceReference: { type: String },
    returnType: {
      type: String,
      required: true,
      enum: [...RETURN_TYPES],
      default: 'original',
    },
    originalReturnId: { type: Schema.Types.ObjectId, ref: 'TaxReturnResult' },
    amendmentNumber: { type: Number },
    amendmentReason: { type: String },
    amendmentChanges: { type: Schema.Types.Mixed },

    income: { type: incomeSchema, required: true },
    deductions: { type: deductionsSchema, required: true },

    taxableIncome: { type: Number, required: true },
    taxOnIncome: { type: Number, required: true },
    medicareLevyAmount: { type: Number, default: 0 },

    offsets: { type: offsetsSchema, required: true },

    hecsRepayment: { type: Number, default: 0 },
    totalTaxPayable: { type: Number, required: true },
    taxWithheld: { type: Number, required: true },
    refundOrOwing: { type: Number, required: true },
    superannuationTotal: { type: Number },

    lodgementDate: { type: Date },
    lodgementMethod: { type: String, enum: [...LODGEMENT_METHODS] },
    assessmentDate: { type: Date },
    assessmentNoticeRef: { type: String },
    assessmentVariance: { type: Number },

    atoAmendmentRef: { type: String },
    atoAmendmentStatus: { type: String, enum: [...ATO_AMENDMENT_STATUSES] },

    previousEstimateId: { type: Schema.Types.ObjectId, ref: 'TaxEstimateLog' },
    preparedAt: { type: Date },

    isLocked: { type: Boolean, default: false },
    lockedAt: { type: Date },
    lockedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    enteredBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

taxReturnResultSchema.index({ orderId: 1, returnType: 1 });
taxReturnResultSchema.index({ userId: 1, financialYear: 1 });
taxReturnResultSchema.index({ rulesSnapshotId: 1 });
taxReturnResultSchema.index({ originalReturnId: 1 });
taxReturnResultSchema.index({ isLocked: 1, financialYear: 1 });

// ─── Pre-save: VER-INV-06 Locked record protection ───────────────────────────

const LOCKED_IMMUTABLE_FIELDS: ReadonlyArray<string> = [
  'income',
  'deductions',
  'taxableIncome',
  'taxOnIncome',
  'medicareLevyAmount',
  'offsets',
  'hecsRepayment',
  'totalTaxPayable',
  'taxWithheld',
  'refundOrOwing',
  'rulesSnapshotId',
];

taxReturnResultSchema.pre('save', function (next) {
  if (!this.isNew && this.isLocked === true) {
    for (const field of LOCKED_IMMUTABLE_FIELDS) {
      if (this.isModified(field)) {
        return next(
          new Error(
            'Cannot modify financial fields on a locked tax return result. Only ATO status fields are editable.',
          ),
        );
      }
    }
  }
  next();
});

// ─── Soft-delete query middleware ─────────────────────────────────────────────

function applySoftDeleteFilter(this: { getFilter(): Record<string, unknown>; setQuery(filter: Record<string, unknown>): void }): void {
  const filter = this.getFilter();
  if (filter['isDeleted'] === undefined) {
    this.setQuery({ ...filter, isDeleted: { $ne: true } });
  }
}

taxReturnResultSchema.pre('find', applySoftDeleteFilter);
taxReturnResultSchema.pre('findOne', applySoftDeleteFilter);
taxReturnResultSchema.pre('countDocuments', applySoftDeleteFilter);

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createTaxReturnResultModel(connection: Connection): Model<ITaxReturnResultDocument> {
  if (connection.models['TaxReturnResult']) {
    return connection.models['TaxReturnResult'] as Model<ITaxReturnResultDocument>;
  }
  return connection.model<ITaxReturnResultDocument>('TaxReturnResult', taxReturnResultSchema);
}
