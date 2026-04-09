import { Schema, type Connection, type Model } from 'mongoose';
import type { ITaxYearSummaryDocument } from '../types';
import { ATO_REFUND_STATUSES } from '../types';

const taxYearSummarySchema = new Schema<ITaxYearSummaryDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    financialYear: { type: String, required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },

    // All monetary values in integer cents
    totalIncome: { type: Number, required: true, default: 0 },
    totalDeductions: { type: Number, required: true, default: 0 },
    taxableIncome: { type: Number, required: true, default: 0 },
    medicareLevyAmount: { type: Number, required: true, default: 0 },
    hecsRepayment: { type: Number, required: true, default: 0 },
    totalTaxPayable: { type: Number, required: true, default: 0 },
    taxWithheld: { type: Number, required: true, default: 0 },
    refundOrOwing: { type: Number, required: true, default: 0 },
    superannuationReported: { type: Number, required: true, default: 0 },

    // Filing & assessment
    filingDate: { type: Date },
    assessmentDate: { type: Date },
    noaReceived: { type: Boolean, default: false },

    // ATO status tracking
    atoRefundStatus: {
      type: String,
      required: true,
      enum: ATO_REFUND_STATUSES,
      default: 'not_filed',
    },
    atoRefundIssuedDate: { type: Date },

    // QEGOS service info
    servicesUsed: [{ type: String }],
    totalPaidToQegos: { type: Number, required: true, default: 0 },
  },
  {
    timestamps: true,
    collection: 'tax_year_summaries',
  },
);

// ─── Indexes ────────────────────────────────────────────────────────────────

// Unique: one summary per user per FY
taxYearSummarySchema.index({ userId: 1, financialYear: 1 }, { unique: true });

// ATO status queries
taxYearSummarySchema.index({ atoRefundStatus: 1 });

// Analytics: churnRiskService does anti-join by financialYear → userId
taxYearSummarySchema.index({ financialYear: 1, userId: 1 });

// ─── Factory ────────────────────────────────────────────────────────────────

export function createTaxYearSummaryModel(
  connection: Connection,
): Model<ITaxYearSummaryDocument> {
  if (connection.models.TaxYearSummary) {
    return connection.models.TaxYearSummary as Model<ITaxYearSummaryDocument>;
  }
  return connection.model<ITaxYearSummaryDocument>('TaxYearSummary', taxYearSummarySchema);
}
