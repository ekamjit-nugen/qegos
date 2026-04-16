import { Schema, type Model, type Connection } from 'mongoose';
import type { ITaxRuleConfigDocument } from './taxRule.types';

const taxBracketSchema = new Schema(
  {
    min: { type: Number, required: true },
    max: { type: Number, default: null },
    rate: { type: Number, required: true },
    baseTax: { type: Number, required: true },
  },
  { _id: false },
);

const taxRuleConfigSchema = new Schema<ITaxRuleConfigDocument>(
  {
    name: { type: String, required: true, trim: true },
    financialYear: { type: String, required: true, trim: true },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'active', 'archived'],
      default: 'draft',
    },
    brackets: { type: [taxBracketSchema], required: true },
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
    hecsHelp: [
      {
        min: { type: Number, required: true },
        max: { type: Number, default: null },
        rate: { type: Number, required: true },
      },
    ],
    lito: {
      type: {
        maxOffset: { type: Number, required: true },
        lowerThreshold: { type: Number, required: true },
        upperThreshold: { type: Number, required: true },
        reductionRate: { type: Number, required: true },
      },
      required: true,
    },
    lmito: {
      type: {
        maxOffset: Number,
        lowerThreshold: Number,
        upperThreshold: Number,
      },
    },
    seniorOffset: {
      type: {
        maxOffset: Number,
        single: Number,
        couple: Number,
      },
    },
    superannuationRate: { type: Number, required: true },
    gstRate: { type: Number, required: true },
    usageCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isFrozen: { type: Boolean, default: false },
  },
  { timestamps: true },
);

taxRuleConfigSchema.index({ financialYear: 1, status: 1 });
taxRuleConfigSchema.index({ status: 1 });

// Financial fields that are immutable once frozen
const IMMUTABLE_FINANCIAL_FIELDS = [
  'brackets',
  'medicareLevy',
  'hecsHelp',
  'lito',
  'lmito',
  'seniorOffset',
  'superannuationRate',
  'gstRate',
  'financialYear',
  'effectiveFrom',
  'effectiveTo',
];

/**
 * VER-INV-01: Used tax configs are permanently immutable.
 * FIX for Vegeta B-26: Pre-save hook checks all financial fields when frozen.
 */
taxRuleConfigSchema.pre('save', function (next) {
  if (this.isNew) {
    return next();
  }

  // If frozen (has been used), block financial field modifications
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
 * Factory function to create the TaxRuleConfig model.
 */
export function createTaxRuleConfigModel(connection: Connection): Model<ITaxRuleConfigDocument> {
  return connection.model<ITaxRuleConfigDocument>('TaxRuleConfig', taxRuleConfigSchema);
}
