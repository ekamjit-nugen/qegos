import type { Model, FilterQuery } from 'mongoose';
import { AppError } from '@nugen/error-handler';
import type {
  IPromoCodeDocument,
  IPromoCodeUsageDocument,
  CreatePromoCodeInput,
  PromoCodeListQuery,
  PromoCodeValidationResult,
} from './promoCode.types';

export interface PromoCodeServiceDeps {
  PromoCodeModel: Model<IPromoCodeDocument>;
  PromoCodeUsageModel: Model<IPromoCodeUsageDocument>;
}

export interface PromoCodeServiceResult {
  createPromoCode: (data: CreatePromoCodeInput, createdBy: string) => Promise<IPromoCodeDocument>;
  validatePromoCode: (
    code: string,
    userId: string,
    orderAmount: number,
    salesItemId?: string,
  ) => Promise<PromoCodeValidationResult>;
  applyPromoCode: (
    code: string,
    userId: string,
    orderId: string,
    orderAmount: number,
  ) => Promise<{ discountApplied: number }>;
  /**
   * Compensating reverse of `applyPromoCode`. Removes the PromoCodeUsage row
   * and decrements the PromoCode.usageCount counter for the given (code,
   * user, order) tuple. Used by sagas that fail after `applyPromoCode`
   * succeeded — without this the user's per-user usage cap and the global
   * usage cap drift permanently.
   *
   * Returns the number of usage rows removed (0 if nothing matched, which
   * the caller can treat as already-revoked / nothing-to-do).
   */
  revokePromoCode: (code: string, userId: string, orderId: string) => Promise<number>;
  listPromoCodes: (
    query: PromoCodeListQuery,
  ) => Promise<{ promoCodes: IPromoCodeDocument[]; total: number; page: number; limit: number }>;
  getPromoCode: (id: string) => Promise<IPromoCodeDocument>;
  updatePromoCode: (id: string, data: Partial<CreatePromoCodeInput>) => Promise<IPromoCodeDocument>;
  deactivatePromoCode: (id: string) => Promise<IPromoCodeDocument>;
  getPromoCodeUsage: (id: string) => Promise<IPromoCodeUsageDocument[]>;
}

export function createPromoCodeService(deps: PromoCodeServiceDeps): PromoCodeServiceResult {
  const { PromoCodeModel, PromoCodeUsageModel } = deps;

  // ─── Create ────────────────────────────────────────────────────────────

  async function createPromoCode(
    data: CreatePromoCodeInput,
    createdBy: string,
  ): Promise<IPromoCodeDocument> {
    const code = data.code.toUpperCase().trim();

    // Check for duplicate code
    const existing = await PromoCodeModel.findOne({ code });
    if (existing) {
      throw AppError.conflict('Promo code already exists');
    }

    // Validate percent discount range
    if (data.discountType === 'percent' && (data.discountValue <= 0 || data.discountValue > 100)) {
      throw AppError.badRequest('Percent discount must be between 1 and 100');
    }

    // Validate dates
    const validFrom = new Date(data.validFrom);
    const validUntil = new Date(data.validUntil);
    if (validUntil <= validFrom) {
      throw AppError.badRequest('validUntil must be after validFrom');
    }

    return PromoCodeModel.create({
      code,
      description: data.description,
      discountType: data.discountType,
      discountValue: data.discountValue,
      minOrderAmount: data.minOrderAmount ?? 0,
      maxDiscountAmount: data.maxDiscountAmount,
      maxUsageTotal: data.maxUsageTotal,
      maxUsagePerUser: data.maxUsagePerUser ?? 1,
      usageCount: 0,
      validFrom,
      validUntil,
      isActive: true,
      applicableSalesItemIds: data.applicableSalesItemIds ?? [],
      createdBy,
      isDeleted: false,
    });
  }

  // ─── Validate ──────────────────────────────────────────────────────────

  function calculateDiscount(promo: IPromoCodeDocument, orderAmount: number): number {
    let discount: number;
    if (promo.discountType === 'percent') {
      discount = Math.round(orderAmount * (promo.discountValue / 100));
      if (promo.maxDiscountAmount && discount > promo.maxDiscountAmount) {
        discount = promo.maxDiscountAmount;
      }
    } else {
      // flat discount in cents
      discount = promo.discountValue;
    }
    // Never discount more than the order amount
    return Math.min(discount, orderAmount);
  }

  async function validatePromoCode(
    code: string,
    userId: string,
    orderAmount: number,
    salesItemId?: string,
  ): Promise<PromoCodeValidationResult> {
    const promo = await PromoCodeModel.findOne({ code: code.toUpperCase().trim() });

    if (!promo) {
      return {
        valid: false,
        code,
        discountType: 'flat',
        discountValue: 0,
        calculatedDiscount: 0,
        message: 'Invalid promo code',
      };
    }

    if (!promo.isActive) {
      return {
        valid: false,
        code,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        calculatedDiscount: 0,
        message: 'This promo code is no longer active',
      };
    }

    const now = new Date();
    if (now < promo.validFrom) {
      return {
        valid: false,
        code,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        calculatedDiscount: 0,
        message: 'This promo code is not yet valid',
      };
    }
    if (now > promo.validUntil) {
      return {
        valid: false,
        code,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        calculatedDiscount: 0,
        message: 'This promo code has expired',
      };
    }

    // Check global usage limit
    if (promo.maxUsageTotal && promo.usageCount >= promo.maxUsageTotal) {
      return {
        valid: false,
        code,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        calculatedDiscount: 0,
        message: 'This promo code has reached its usage limit',
      };
    }

    // Check per-user usage limit
    const userUsageCount = await PromoCodeUsageModel.countDocuments({
      promoCodeId: promo._id,
      userId,
    });
    if (userUsageCount >= promo.maxUsagePerUser) {
      return {
        valid: false,
        code,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        calculatedDiscount: 0,
        message: 'You have already used this promo code',
      };
    }

    // Check minimum order amount
    if (orderAmount < promo.minOrderAmount) {
      return {
        valid: false,
        code,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        calculatedDiscount: 0,
        message: `Minimum order amount is $${(promo.minOrderAmount / 100).toFixed(2)}`,
      };
    }

    // Check applicable sales items
    if (promo.applicableSalesItemIds.length > 0 && salesItemId) {
      const isApplicable = promo.applicableSalesItemIds.some((id) => String(id) === salesItemId);
      if (!isApplicable) {
        return {
          valid: false,
          code,
          discountType: promo.discountType,
          discountValue: promo.discountValue,
          calculatedDiscount: 0,
          message: 'This promo code is not valid for this service',
        };
      }
    }

    const calculatedDiscount = calculateDiscount(promo, orderAmount);

    return {
      valid: true,
      code: promo.code,
      promoCodeId: String(promo._id),
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      calculatedDiscount,
    };
  }

  // ─── Apply ─────────────────────────────────────────────────────────────

  async function applyPromoCode(
    code: string,
    userId: string,
    orderId: string,
    orderAmount: number,
  ): Promise<{ discountApplied: number }> {
    const validation = await validatePromoCode(code, userId, orderAmount);
    if (!validation.valid) {
      throw AppError.badRequest(validation.message ?? 'Invalid promo code');
    }

    const promo = await PromoCodeModel.findOne({ code: code.toUpperCase().trim() });
    if (!promo) {
      throw AppError.notFound('Promo code not found');
    }

    const discountApplied = validation.calculatedDiscount;

    // Record usage
    await PromoCodeUsageModel.create({
      promoCodeId: promo._id,
      userId,
      orderId,
      discountApplied,
    });

    // Increment usage count
    await PromoCodeModel.findByIdAndUpdate(promo._id, {
      $inc: { usageCount: 1 },
    });

    return { discountApplied };
  }

  // ─── Revoke (compensating reverse of applyPromoCode) ───────────────────

  async function revokePromoCode(code: string, userId: string, orderId: string): Promise<number> {
    const promo = await PromoCodeModel.findOne({ code: code.toUpperCase().trim() });
    if (!promo) {
      // Nothing to revoke — promo no longer exists.
      return 0;
    }

    const deleted = await PromoCodeUsageModel.deleteMany({
      promoCodeId: promo._id,
      userId,
      orderId,
    });

    if (deleted.deletedCount > 0) {
      await PromoCodeModel.findByIdAndUpdate(promo._id, {
        $inc: { usageCount: -deleted.deletedCount },
      });
    }

    return deleted.deletedCount;
  }

  // ─── List ──────────────────────────────────────────────────────────────

  async function listPromoCodes(
    query: PromoCodeListQuery,
  ): Promise<{ promoCodes: IPromoCodeDocument[]; total: number; page: number; limit: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter: FilterQuery<IPromoCodeDocument> = {};
    if (query.search) {
      filter.$or = [
        { code: { $regex: query.search, $options: 'i' } },
        { description: { $regex: query.search, $options: 'i' } },
      ];
    }
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    const [promoCodes, total] = await Promise.all([
      PromoCodeModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<IPromoCodeDocument[]>(),
      PromoCodeModel.countDocuments(filter),
    ]);

    return { promoCodes, total, page, limit };
  }

  // ─── Get ───────────────────────────────────────────────────────────────

  async function getPromoCode(id: string): Promise<IPromoCodeDocument> {
    const promo = await PromoCodeModel.findById(id).lean<IPromoCodeDocument>();
    if (!promo) {
      throw AppError.notFound('Promo code not found');
    }
    return promo;
  }

  // ─── Update ────────────────────────────────────────────────────────────

  async function updatePromoCode(
    id: string,
    data: Partial<CreatePromoCodeInput>,
  ): Promise<IPromoCodeDocument> {
    const update: Record<string, unknown> = {};
    if (data.description !== undefined) {
      update.description = data.description;
    }
    if (data.discountType !== undefined) {
      update.discountType = data.discountType;
    }
    if (data.discountValue !== undefined) {
      update.discountValue = data.discountValue;
    }
    if (data.minOrderAmount !== undefined) {
      update.minOrderAmount = data.minOrderAmount;
    }
    if (data.maxDiscountAmount !== undefined) {
      update.maxDiscountAmount = data.maxDiscountAmount;
    }
    if (data.maxUsageTotal !== undefined) {
      update.maxUsageTotal = data.maxUsageTotal;
    }
    if (data.maxUsagePerUser !== undefined) {
      update.maxUsagePerUser = data.maxUsagePerUser;
    }
    if (data.validFrom !== undefined) {
      update.validFrom = new Date(data.validFrom);
    }
    if (data.validUntil !== undefined) {
      update.validUntil = new Date(data.validUntil);
    }

    const promo = await PromoCodeModel.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!promo) {
      throw AppError.notFound('Promo code not found');
    }
    return promo;
  }

  // ─── Deactivate ────────────────────────────────────────────────────────

  async function deactivatePromoCode(id: string): Promise<IPromoCodeDocument> {
    const promo = await PromoCodeModel.findByIdAndUpdate(
      id,
      { $set: { isActive: false } },
      { new: true },
    );
    if (!promo) {
      throw AppError.notFound('Promo code not found');
    }
    return promo;
  }

  // ─── Usage History ─────────────────────────────────────────────────────

  async function getPromoCodeUsage(id: string): Promise<IPromoCodeUsageDocument[]> {
    return PromoCodeUsageModel.find({ promoCodeId: id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean<IPromoCodeUsageDocument[]>();
  }

  return {
    createPromoCode,
    validatePromoCode,
    applyPromoCode,
    revokePromoCode,
    listPromoCodes,
    getPromoCode,
    updatePromoCode,
    deactivatePromoCode,
    getPromoCodeUsage,
  };
}
