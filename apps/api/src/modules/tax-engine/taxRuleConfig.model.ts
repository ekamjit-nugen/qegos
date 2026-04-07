import crypto from 'crypto';
import { Schema, type Model, type Connection } from 'mongoose';
import type { ITaxRuleConfigDocument } from './taxEngine.types';

const taxBracketSchema = new Schema(
  {
    min: { type: Number, required: true },
    max: { type: Number, default: null },
    rate: { type: Number, required: true },
    baseTax: { type: Number, required: true },
  },
  { _id: false },
);

const surchargeTierSchema = new Schema(
  {
    min: { type: Number, required: true },
    max: { type: Number, default: null },
    rate: { type: Number, required: true },
  },
  { _id: false },
);

const changeLogEntrySchema = new Schema(
  {
    date: { type: Date, required: true },
    field: { type: String, required: true },
    from: { type: Schema.Types.Mixed },
    to: { type: Schema.Types.Mixed },
    reason: { type: String, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false },
);

const taxRuleConfigSchema = new Schema<ITaxRuleConfigDocument>(
  {
    snapshotId: {
      type: String,
      unique: true,
      immutable: true,
      required: true,
    },
    name: { type: String, required: true, trim: true },
    financialYear: { type: String, required: true, trim: true },
    version: { type: Number, required: true },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'active', 'superseded', 'frozen'],
      default: 'draft',
    },

    // Resident brackets
    brackets: { type: [taxBracketSchema], required: true },
    // Non-resident brackets (Phase 4)
    nonResidentBrackets: { type: [taxBracketSchema], required: true },
    // Working holiday maker brackets (Phase 4)
    workingHolidayBrackets: { type: [taxBracketSchema], required: true },

    // Medicare Levy
    medicareLevy: {
      type: {
        rate: { type: Number, required: true },
        surchargeRate: { type: Number, required: true },
        lowIncomeThreshold: { type: Number, required: true },
        phaseInRange: { type: Number, required: true },
        familyThreshold: { type: Number, required: true },
        additionalChildAmount: { type: Number, required: true },
      },
      required: true,
    },
    medicareLevySurchargeTiers: { type: [surchargeTierSchema], default: [] },
    medicareLevySeniorSingleThreshold: { type: Number, default: 0 },
    medicareLevyFamilyPerChild: { type: Number, default: 0 },

    // HECS-HELP tiers
    hecsHelp: [
      {
        min: { type: Number, required: true },
        max: { type: Number, default: null },
        rate: { type: Number, required: true },
      },
    ],

    // LITO
    lito: {
      type: {
        maxOffset: { type: Number, required: true },
        lowerThreshold: { type: Number, required: true },
        upperThreshold: { type: Number, required: true },
        reductionRate: { type: Number, required: true },
      },
      required: true,
    },

    // LMITO (phased out but retained for historical rules)
    lmito: {
      type: {
        maxOffset: Number,
        lowerThreshold: Number,
        upperThreshold: Number,
      },
    },

    // Senior offset (legacy)
    seniorOffset: {
      type: {
        maxOffset: Number,
        single: Number,
        couple: Number,
      },
    },

    // SAPTO (Phase 4)
    sapto: {
      type: {
        maxSingle: { type: Number, required: true },
        maxCouple: { type: Number, required: true },
        thresholdSingle: { type: Number, required: true },
        phaseOutRate: { type: Number, required: true },
      },
      required: true,
    },

    // CGT / asset write-off
    cgtDiscount: { type: Number, required: true, default: 0.50 },
    instantAssetWriteOff: { type: Number, default: 0 },

    // Rates
    superannuationRate: { type: Number, required: true },
    gstRate: { type: Number, required: true },

    // Provenance
    legislationReference: { type: String },
    budgetReference: { type: String },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },

    // Correction chain (VER-INV-07)
    parentSnapshotId: { type: String },
    changeReason: { type: String },
    changeLog: { type: [changeLogEntrySchema], default: [] },

    // Usage tracking
    usageCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isFrozen: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// ─── Indexes ───────────────────────────────────────────────────────────────

taxRuleConfigSchema.index({ snapshotId: 1 }, { unique: true });
taxRuleConfigSchema.index({ financialYear: 1, status: 1 });
taxRuleConfigSchema.index({ financialYear: 1, version: -1 });
taxRuleConfigSchema.index({ parentSnapshotId: 1 });
taxRuleConfigSchema.index({ status: 1 });

// ─── Immutability ──────────────────────────────────────────────────────────

const IMMUTABLE_FINANCIAL_FIELDS = [
  'brackets', 'nonResidentBrackets', 'workingHolidayBrackets',
  'medicareLevy', 'medicareLevySurchargeTiers',
  'medicareLevySeniorSingleThreshold', 'medicareLevyFamilyPerChild',
  'hecsHelp', 'lito', 'lmito', 'seniorOffset', 'sapto',
  'cgtDiscount', 'instantAssetWriteOff',
  'superannuationRate', 'gstRate',
  'financialYear', 'effectiveFrom', 'effectiveTo',
];

/**
 * VER-INV-01: Used tax configs are permanently immutable.
 * VER-INV-11: snapshotId generated at creation, never regenerated.
 * VER-INV-07: changeReason required when parentSnapshotId is set.
 */
taxRuleConfigSchema.pre('save', async function (next) {
  // Generate snapshotId on creation
  if (this.isNew) {
    if (!this.snapshotId) {
      this.snapshotId = crypto.randomUUID();
    }

    // Auto-increment version per financialYear
    if (!this.version) {
      const model = this.constructor as Model<ITaxRuleConfigDocument>;
      const latest = await model
        .findOne({ financialYear: this.financialYear })
        .sort({ version: -1 })
        .select('version')
        .lean<{ version: number }>();
      this.version = (latest?.version ?? 0) + 1;
    }

    return next();
  }

  // VER-INV-07: changeReason required for corrections
  if (this.parentSnapshotId && !this.changeReason) {
    return next(new Error('changeReason is required when parentSnapshotId is set'));
  }

  // VER-INV-01: Block financial field modification if frozen/used
  if (this.isFrozen || this.usageCount > 0) {
    for (const field of IMMUTABLE_FINANCIAL_FIELDS) {
      if (this.isModified(field)) {
        return next(
          new Error(
            `Cannot modify "${field}" on a frozen/used tax rule configuration. Create a new version instead.`,
          ),
        );
      }
    }
  }

  next();
});

/**
 * Factory function to create the TaxRuleConfig model (Phase 4 enhanced).
 */
export function createTaxRuleConfigModelV2(connection: Connection): Model<ITaxRuleConfigDocument> {
  // Check if model already registered to avoid OverwriteModelError
  if (connection.models['TaxRuleConfig']) {
    return connection.models['TaxRuleConfig'] as Model<ITaxRuleConfigDocument>;
  }
  return connection.model<ITaxRuleConfigDocument>('TaxRuleConfig', taxRuleConfigSchema);
}
