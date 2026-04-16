import type { Document, Types } from 'mongoose';

// ─── Enums ─────────────────────────────────────────────────────────────────

export const DISCOUNT_TYPES = ['percent', 'flat'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

// ─── Promo Code Interface ──────────────────────────────────────────────────

export interface IPromoCode {
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: number; // percent (0-100) or cents
  minOrderAmount: number; // minimum order total in cents (default 0)
  maxDiscountAmount?: number; // cap for percent discounts in cents
  maxUsageTotal?: number; // max global uses (null = unlimited)
  maxUsagePerUser: number; // max per user (default 1)
  usageCount: number; // current total uses
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
  applicableSalesItemIds: Types.ObjectId[];
  createdBy: Types.ObjectId;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPromoCodeDocument extends IPromoCode, Document {
  _id: Types.ObjectId;
}

// ─── Promo Code Usage ──────────────────────────────────────────────────────

export interface IPromoCodeUsage {
  promoCodeId: Types.ObjectId;
  userId: Types.ObjectId;
  orderId: Types.ObjectId;
  discountApplied: number; // cents
  createdAt: Date;
}

export interface IPromoCodeUsageDocument extends IPromoCodeUsage, Document {
  _id: Types.ObjectId;
}

// ─── Validation Result ─────────────────────────────────────────────────────

export interface PromoCodeValidationResult {
  valid: boolean;
  code: string;
  promoCodeId?: string;
  discountType: DiscountType;
  discountValue: number;
  calculatedDiscount: number; // cents — actual discount for the given order amount
  message?: string;
}

// ─── Route Dependencies ────────────────────────────────────────────────────

export interface PromoCodeRouteDeps {
  PromoCodeModel: import('mongoose').Model<IPromoCodeDocument>;
  PromoCodeUsageModel: import('mongoose').Model<IPromoCodeUsageDocument>;
  authenticate: () => import('express').RequestHandler;
  checkPermission: import('@nugen/rbac').CheckPermissionFn;
}

// ─── Service DTOs ──────────────────────────────────────────────────────────

export interface CreatePromoCodeInput {
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  maxUsageTotal?: number;
  maxUsagePerUser?: number;
  validFrom: string;
  validUntil: string;
  applicableSalesItemIds?: string[];
}

export interface PromoCodeListQuery {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}
