import type { Model } from 'mongoose';
import { AppError } from '@nugen/error-handler';
import type { IReferralDocument, IReferralConfigDocument, ReferralRewardType } from './referral.types';
import { DEFAULT_REFERRAL_CONFIG } from './referral.types';
import type { CreditServiceResult } from '../credit/credit.service';

// ─── Module State ───────────────────────────────────────────────────────────

let ReferralModel: Model<IReferralDocument>;
let ReferralConfigModel: Model<IReferralConfigDocument>;
let UserModel: Model<any>;
let OrderModel: Model<any>;
let LeadModel: Model<any>;
let CounterModel: Model<any>;
let creditService: CreditServiceResult | null = null;

export function initReferralService(deps: {
  ReferralModel: Model<IReferralDocument>;
  ReferralConfigModel: Model<IReferralConfigDocument>;
  UserModel: Model<any>;
  OrderModel: Model<any>;
  LeadModel: Model<any>;
  CounterModel: Model<any>;
  creditService?: CreditServiceResult;
}): void {
  ReferralModel = deps.ReferralModel;
  ReferralConfigModel = deps.ReferralConfigModel;
  UserModel = deps.UserModel;
  OrderModel = deps.OrderModel;
  LeadModel = deps.LeadModel;
  CounterModel = deps.CounterModel;
  creditService = deps.creditService ?? null;
}

// ─── Config Helpers ─────────────────────────────────────────────────────────

async function getConfig(): Promise<IReferralConfigDocument> {
  let config = await ReferralConfigModel.findOne();
  if (!config) {
    config = await ReferralConfigModel.create(DEFAULT_REFERRAL_CONFIG);
  }
  return config;
}

export async function getReferralConfig(): Promise<IReferralConfigDocument> {
  return getConfig();
}

export async function updateReferralConfig(
  updates: Partial<{
    isEnabled: boolean;
    rewardType: ReferralRewardType;
    referrerRewardValue: number;
    refereeRewardValue: number;
    maxReferralsPerClient: number;
    referralExpiryDays: number;
    minimumOrderValueForReward: number;
  }>,
): Promise<IReferralConfigDocument> {
  const config = await getConfig();
  Object.assign(config, updates);
  await config.save();
  return config;
}

// ─── Generate / Get Code ────────────────────────────────────────────────────

export async function getOrGenerateCode(userId: string): Promise<string> {
  const user = await UserModel.findById(userId);
  if (!user) throw AppError.notFound('User');

  if (user.referralCode) return user.referralCode as string;

  // Generate QGS-REF-XXXX via CounterModel
  const counter = await CounterModel.findOneAndUpdate(
    { name: 'referral' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  const code = `QGS-REF-${String(counter.seq).padStart(4, '0')}`;

  user.referralCode = code;
  await user.save();

  return code;
}

// ─── Validate Code ──────────────────────────────────────────────────────────

export async function validateCode(
  code: string,
): Promise<{ valid: boolean; referrerFirstName?: string }> {
  const referral = await UserModel.findOne({ referralCode: code.toUpperCase() });
  if (!referral) return { valid: false };
  return { valid: true, referrerFirstName: referral.firstName as string };
}

// ─── Apply Referral ─────────────────────────────────────────────────────────

export async function applyReferral(
  referralCode: string,
  refereeUserId: string,
  refereeLeadId?: string,
): Promise<IReferralDocument> {
  const config = await getConfig();
  if (!config.isEnabled) {
    throw AppError.badRequest('Referral programme is currently disabled');
  }

  const code = referralCode.toUpperCase();

  // Look up referrer by code
  const referrer = await UserModel.findOne({ referralCode: code });
  if (!referrer) throw AppError.notFound('Referral code');

  // REF-INV-02: Self-referral check (both mobile AND email)
  const referee = await UserModel.findById(refereeUserId);
  if (!referee) throw AppError.notFound('Referee user');

  if (
    referrer._id.toString() === refereeUserId ||
    (referrer.mobile && referee.mobile && referrer.mobile === referee.mobile) ||
    (referrer.email && referee.email && referrer.email === referee.email)
  ) {
    throw AppError.badRequest('Self-referral is not allowed');
  }

  // REF-INV-03: One referral per referee (unique refereeId index enforces this)
  const existingReferral = await ReferralModel.findOne({ refereeId: refereeUserId });
  if (existingReferral) {
    throw AppError.badRequest('This user has already been referred');
  }

  // Validate refereeLeadId ownership — refuse to attribute another user's
  // converted lead to this referral. Unconverted leads (no convertedUserId)
  // are OK to attach because they haven't been claimed yet.
  if (refereeLeadId) {
    const lead = await LeadModel.findById(refereeLeadId)
      .select('convertedUserId')
      .lean<{ convertedUserId?: unknown }>();
    if (!lead) {
      throw AppError.notFound('Referee lead');
    }
    if (lead.convertedUserId && String(lead.convertedUserId) !== String(refereeUserId)) {
      throw AppError.badRequest('Referee lead does not belong to this user');
    }
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.referralExpiryDays);

  const referral = await ReferralModel.create({
    referralCode: code,
    referrerId: referrer._id,
    refereeId: refereeUserId,
    refereeLeadId: refereeLeadId || undefined,
    status: 'pending',
    rewardType: config.rewardType,
    referrerRewardAmount: config.referrerRewardValue,
    refereeRewardAmount: config.refereeRewardValue,
    expiresAt,
  });

  // REF-INV-06: Set Lead.source = referral
  if (refereeLeadId) {
    await LeadModel.findByIdAndUpdate(refereeLeadId, { source: 'referral' });
  }

  return referral;
}

// ─── Process Reward ─────────────────────────────────────────────────────────

export async function processReward(refereeOrderId: string): Promise<IReferralDocument | null> {
  const order = await OrderModel.findById(refereeOrderId);
  if (!order) throw AppError.notFound('Order');

  // REF-INV-01: order completed (status >= 6) + payment succeeded
  if (order.status < 6) return null;
  if (order.paymentStatus !== 'succeeded') return null;

  const config = await getConfig();

  // Check minimum order value
  if (order.finalAmount < config.minimumOrderValueForReward) return null;

  // Find the referral for this referee
  const referral = await ReferralModel.findOne({
    refereeId: order.userId,
    status: { $in: ['pending', 'signed_up', 'order_created', 'completed'] },
  });
  if (!referral) return null;

  // REF-INV-07: Count referrer's rewarded referrals this year
  const yearStart = new Date();
  yearStart.setMonth(0, 1);
  yearStart.setHours(0, 0, 0, 0);

  const rewardedCount = await ReferralModel.countDocuments({
    referrerId: referral.referrerId,
    referrerRewarded: true,
    createdAt: { $gte: yearStart },
  });

  if (rewardedCount >= config.maxReferralsPerClient) return null;

  // ─── Atomically claim the referral BEFORE issuing credits (REF-INV idempotency).
  // Filter on `referrerRewarded: false` so concurrent callers race on a single
  // write — only the winner proceeds to addCredit. Without this, a retry or
  // duplicate webhook could issue the reward twice.
  const claimed = await ReferralModel.findOneAndUpdate(
    { _id: referral._id, referrerRewarded: false },
    {
      $set: {
        status: 'rewarded',
        referrerRewarded: true,
        refereeRewarded: true,
        refereeOrderId: order._id,
      },
    },
    { new: true },
  );
  if (!claimed) return null; // another caller already processed

  // ─── Issue Rewards Based on Config ────────────────────────────────────────
  const referrerId = String(claimed.referrerId);
  const refereeId = String(claimed.refereeId);

  if (config.rewardType === 'credit_balance' && creditService) {
    // REF-INV-04: Credits expire after 12 months
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    // Issue credit to referrer
    if (config.referrerRewardValue > 0) {
      await creditService.addCredit(
        referrerId,
        config.referrerRewardValue,
        'referral_reward',
        `Referral reward: ${claimed.referralCode} (referrer)`,
        claimed._id.toString(),
        expiresAt,
      );
    }

    // Issue credit to referee
    if (config.refereeRewardValue > 0) {
      await creditService.addCredit(
        refereeId,
        config.refereeRewardValue,
        'referral_reward',
        `Referral reward: ${claimed.referralCode} (referee)`,
        claimed._id.toString(),
        expiresAt,
      );
    }
  } else if (config.rewardType === 'flat_discount' && creditService) {
    // Flat discount issued as credits (immediate use, 12-month expiry)
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    if (config.referrerRewardValue > 0) {
      await creditService.addCredit(
        referrerId,
        config.referrerRewardValue,
        'referral_reward',
        `Referral flat discount: ${claimed.referralCode} (referrer)`,
        claimed._id.toString(),
        expiresAt,
      );
    }

    if (config.refereeRewardValue > 0) {
      await creditService.addCredit(
        refereeId,
        config.refereeRewardValue,
        'referral_reward',
        `Referral flat discount: ${claimed.referralCode} (referee)`,
        claimed._id.toString(),
        expiresAt,
      );
    }
  }
  // discount_percent type: stored on referral for application at checkout (no credit issued)
  // State flip already happened atomically above via findOneAndUpdate; returning the claimed doc.

  return claimed;
}

// ─── List My Referrals ──────────────────────────────────────────────────────

export async function listMyReferrals(
  userId: string,
  page = 1,
  limit = 20,
): Promise<{ referrals: IReferralDocument[]; total: number }> {
  const skip = (page - 1) * limit;

  const [referrals, total] = await Promise.all([
    ReferralModel.find({ referrerId: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ReferralModel.countDocuments({ referrerId: userId }),
  ]);

  return { referrals: referrals as unknown as IReferralDocument[], total };
}

// ─── Dashboard (Admin) ─────────────────────────────────────────────────────

export async function getDashboard(): Promise<{
  total: number;
  byStatus: Record<string, number>;
  conversionRate: number;
  totalRewardCost: number;
  topReferrers: Array<{ _id: string; count: number }>;
}> {
  const [total, byStatusAgg, rewardedCount, rewardCostAgg, topReferrers] = await Promise.all([
    ReferralModel.countDocuments(),
    ReferralModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    ReferralModel.countDocuments({ status: 'rewarded' }),
    ReferralModel.aggregate([
      { $match: { referrerRewarded: true } },
      { $group: { _id: null, total: { $sum: '$referrerRewardAmount' } } },
    ]),
    ReferralModel.aggregate([
      { $match: { referrerRewarded: true } },
      { $group: { _id: '$referrerId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
  ]);

  const byStatus: Record<string, number> = {};
  for (const item of byStatusAgg) {
    byStatus[item._id as string] = item.count as number;
  }

  const conversionRate = total > 0 ? rewardedCount / total : 0;
  const totalRewardCost = rewardCostAgg[0]?.total ?? 0;

  return { total, byStatus, conversionRate, totalRewardCost, topReferrers };
}

// ─── Leaderboard ────────────────────────────────────────────────────────────

export async function getLeaderboard(
  limit = 10,
): Promise<Array<{ _id: string; count: number; totalRewards: number }>> {
  return ReferralModel.aggregate([
    { $match: { referrerRewarded: true } },
    {
      $group: {
        _id: '$referrerId',
        count: { $sum: 1 },
        totalRewards: { $sum: '$referrerRewardAmount' },
      },
    },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);
}

// ─── Cron: Expire Stale Referrals ───────────────────────────────────────────

export async function expireStaleReferrals(): Promise<number> {
  const result = await ReferralModel.updateMany(
    {
      status: { $nin: ['rewarded', 'expired'] },
      expiresAt: { $lt: new Date() },
    },
    { $set: { status: 'expired' } },
  );
  return result.modifiedCount;
}

// ─── Cron: Expire Credit Rewards (REF-INV-04) ──────────────────────────────

export async function expireCreditRewards(): Promise<number> {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  const result = await ReferralModel.updateMany(
    {
      status: 'rewarded',
      rewardType: 'credit_balance',
      referrerRewarded: true,
      updatedAt: { $lt: twelveMonthsAgo },
    },
    { $set: { status: 'expired' } },
  );
  return result.modifiedCount;
}
