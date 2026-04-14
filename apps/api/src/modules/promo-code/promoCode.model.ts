import { Schema, type Model, type Connection } from 'mongoose';
import type { IPromoCodeDocument, IPromoCodeUsageDocument } from './promoCode.types';
import { DISCOUNT_TYPES } from './promoCode.types';

// ─── Promo Code Schema ─────────────────────────────────────────────────────

const promoCodeSchema = new Schema<IPromoCodeDocument>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    description: { type: String, required: true, trim: true },
    discountType: { type: String, enum: DISCOUNT_TYPES, required: true },
    discountValue: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number): boolean => v > 0,
        message: 'Discount value must be positive',
      },
    },
    minOrderAmount: {
      type: Number,
      default: 0,
      validate: {
        validator: (v: number): boolean => Number.isInteger(v) && v >= 0,
        message: 'minOrderAmount must be a non-negative integer (cents)',
      },
    },
    maxDiscountAmount: {
      type: Number,
      validate: {
        validator: (v: number): boolean => Number.isInteger(v) && v > 0,
        message: 'maxDiscountAmount must be a positive integer (cents)',
      },
    },
    maxUsageTotal: { type: Number },
    maxUsagePerUser: { type: Number, default: 1, min: 1 },
    usageCount: { type: Number, default: 0 },
    validFrom: { type: Date, required: true },
    validUntil: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    applicableSalesItemIds: [{ type: Schema.Types.ObjectId, ref: 'Sales' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

// Soft-delete filter
promoCodeSchema.pre('find', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

promoCodeSchema.pre('findOne', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

promoCodeSchema.pre('countDocuments', function () {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
});

// ─── Promo Code Usage Schema ───────────────────────────────────────────────

const promoCodeUsageSchema = new Schema<IPromoCodeUsageDocument>(
  {
    promoCodeId: { type: Schema.Types.ObjectId, ref: 'PromoCode', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    discountApplied: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number): boolean => Number.isInteger(v) && v > 0,
        message: 'discountApplied must be a positive integer (cents)',
      },
    },
  },
  { timestamps: true },
);

promoCodeUsageSchema.index({ promoCodeId: 1, userId: 1 });
promoCodeUsageSchema.index({ orderId: 1 });

// ─── Model Factories ───────────────────────────────────────────────────────

export function createPromoCodeModel(connection: Connection): Model<IPromoCodeDocument> {
  return connection.model<IPromoCodeDocument>('PromoCode', promoCodeSchema);
}

export function createPromoCodeUsageModel(connection: Connection): Model<IPromoCodeUsageDocument> {
  return connection.model<IPromoCodeUsageDocument>('PromoCodeUsage', promoCodeUsageSchema);
}
