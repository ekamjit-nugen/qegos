import { Schema, type Model, type Connection } from 'mongoose';
import type { ISalesDocument } from './order.types';
import { SALES_CATEGORIES } from './order.types';

const salesSchema = new Schema<ISalesDocument>(
  {
    title: { type: String, required: [true, 'Service title is required'], trim: true },
    description: { type: String, trim: true },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      validate: {
        validator: (v: number): boolean => Number.isInteger(v) && v >= 0,
        message: 'Price must be a non-negative integer (cents)',
      },
    },
    gstInclusive: { type: Boolean, default: true },
    gstAmount: {
      type: Number,
      default: 0,
      validate: {
        validator: (v: number): boolean => Number.isInteger(v),
        message: 'GST amount must be an integer (cents)',
      },
    },
    category: {
      type: String,
      required: true,
      enum: {
        values: SALES_CATEGORIES,
        message: 'Invalid category: {VALUE}',
      },
    },
    inputBased: { type: Boolean, default: false },
    inputBasedType: { type: String },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    xeroAccountCode: { type: String },
  },
  { timestamps: true },
);

// Auto-calculate GST amount pre-save
salesSchema.pre('save', function (next) {
  if (this.isModified('price') || this.isModified('gstInclusive')) {
    if (this.gstInclusive && this.price > 0) {
      // GST = price / 11 for GST-inclusive prices (Australian GST = 10%)
      this.gstAmount = Math.round(this.price / 11);
    } else {
      this.gstAmount = 0;
    }
  }
  next();
});

/**
 * Factory function to create the Sales model.
 */
export function createSalesModel(connection: Connection): Model<ISalesDocument> {
  return connection.model<ISalesDocument>('Sales', salesSchema);
}

/**
 * Seed the sales catalogue with default Australian services from PRD Section 7.5.
 * Uses $setOnInsert to not overwrite existing services.
 */
export async function seedSalesCatalogue(SalesModel: Model<ISalesDocument>): Promise<void> {
  const services: Array<Partial<ISalesDocument>> = [
    { title: 'Individual Tax Return (simple)', price: 9900, gstInclusive: true, gstAmount: 900, category: 'individual', sortOrder: 1 },
    { title: 'Individual Tax Return (standard)', price: 16500, gstInclusive: true, gstAmount: 1500, category: 'individual', sortOrder: 2 },
    { title: 'Individual Tax Return (complex)', price: 27500, gstInclusive: true, gstAmount: 2500, category: 'individual', sortOrder: 3 },
    { title: 'Rental Property Schedule', price: 11000, gstInclusive: true, gstAmount: 1000, category: 'investment', sortOrder: 4 },
    { title: 'Capital Gains Tax Schedule', price: 8800, gstInclusive: true, gstAmount: 800, category: 'investment', sortOrder: 5 },
    { title: 'Business & Professional Income', price: 22000, gstInclusive: true, gstAmount: 2000, category: 'business', sortOrder: 6 },
    { title: 'Sole Trader / ABN Return', price: 33000, gstInclusive: true, gstAmount: 3000, category: 'business', sortOrder: 7 },
    { title: 'BAS Preparation (quarterly)', price: 16500, gstInclusive: true, gstAmount: 1500, category: 'business', sortOrder: 8 },
    { title: 'PAYG Instalment Variation', price: 5500, gstInclusive: true, gstAmount: 500, category: 'business', sortOrder: 9 },
    { title: 'Amendment to Prior Year', price: 13200, gstInclusive: true, gstAmount: 1200, category: 'individual', sortOrder: 10 },
    { title: 'Private Health Insurance Rebate', price: 2200, gstInclusive: true, gstAmount: 200, category: 'individual', sortOrder: 11 },
    { title: 'HECS-HELP Debt Review', price: 3300, gstInclusive: true, gstAmount: 300, category: 'individual', sortOrder: 12 },
  ];

  for (const service of services) {
    await SalesModel.updateOne(
      { title: service.title },
      { $setOnInsert: { ...service, isActive: true, inputBased: false } },
      { upsert: true },
    );
  }
}
