export type DiscountType = 'percent' | 'flat';

export interface PromoCode {
  _id: string;
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount?: number;
  maxUsageTotal?: number;
  maxUsagePerUser: number;
  usageCount: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  applicableSalesItemIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromoCodeUsage {
  _id: string;
  promoCodeId: string;
  userId: string;
  orderId: string;
  discountApplied: number;
  createdAt: string;
}

export interface PromoCodeListQuery {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}

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
