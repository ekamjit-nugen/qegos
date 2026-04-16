import type { Document, Types } from 'mongoose';

// ─── Referral Status Machine ───────────────────────────────────────────────

export type ReferralStatus =
  | 'pending'
  | 'signed_up'
  | 'order_created'
  | 'completed'
  | 'rewarded'
  | 'expired';

export const REFERRAL_STATUSES: ReferralStatus[] = [
  'pending',
  'signed_up',
  'order_created',
  'completed',
  'rewarded',
  'expired',
];

export const REFERRAL_STATUS_TRANSITIONS: Record<ReferralStatus, ReferralStatus[]> = {
  pending: ['signed_up', 'order_created', 'completed', 'rewarded', 'expired'],
  signed_up: ['order_created', 'completed', 'rewarded', 'expired'],
  order_created: ['completed', 'rewarded', 'expired'],
  completed: ['rewarded', 'expired'],
  // REF-INV-04: credit_balance rewards expire after 12 months (expireCreditRewards cron)
  rewarded: ['expired'],
  expired: [],
};

// ─── Reward & Channel Types ────────────────────────────────────────────────

export type ReferralRewardType = 'discount_percent' | 'flat_discount' | 'credit_balance';

export const REFERRAL_REWARD_TYPES: ReferralRewardType[] = [
  'discount_percent',
  'flat_discount',
  'credit_balance',
];

export type ReferralChannel = 'sms' | 'email' | 'social' | 'direct_link' | 'qr_code' | 'in_person';

export const REFERRAL_CHANNELS: ReferralChannel[] = [
  'sms',
  'email',
  'social',
  'direct_link',
  'qr_code',
  'in_person',
];

// ─── Referral Interface ────────────────────────────────────────────────────

export interface IReferral {
  referralCode: string;
  referrerId: Types.ObjectId;
  refereeId?: Types.ObjectId;
  refereeLeadId?: Types.ObjectId;
  status: ReferralStatus;
  rewardType?: ReferralRewardType;
  referrerRewardAmount?: number; // integer cents or percent
  refereeRewardAmount?: number;
  referrerRewarded: boolean;
  refereeRewarded: boolean;
  referrerOrderId?: Types.ObjectId;
  refereeOrderId?: Types.ObjectId;
  channel?: ReferralChannel;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReferralDocument extends IReferral, Document {
  _id: Types.ObjectId;
}

// ─── Referral Config ───────────────────────────────────────────────────────

export interface IReferralConfig {
  isEnabled: boolean;
  rewardType: ReferralRewardType;
  referrerRewardValue: number; // cents or percent depending on type
  refereeRewardValue: number;
  maxReferralsPerClient: number;
  referralExpiryDays: number;
  minimumOrderValueForReward: number; // integer cents
}

export interface IReferralConfigDocument extends IReferralConfig, Document {
  _id: Types.ObjectId;
}

export const DEFAULT_REFERRAL_CONFIG: IReferralConfig = {
  isEnabled: true,
  rewardType: 'flat_discount',
  referrerRewardValue: 5000, // $50
  refereeRewardValue: 2500, // $25
  maxReferralsPerClient: 50,
  referralExpiryDays: 365,
  minimumOrderValueForReward: 10000, // $100 minimum order
};

// ─── Route Dependencies ────────────────────────────────────────────────────

export interface ReferralRouteDeps {
  ReferralModel: import('mongoose').Model<IReferralDocument>;
  ReferralConfigModel: import('mongoose').Model<IReferralConfigDocument>;
  UserModel: import('mongoose').Model<any>;
  OrderModel: import('mongoose').Model<any>;
  LeadModel: import('mongoose').Model<any>;
  CounterModel: import('mongoose').Model<any>;
  authenticate: () => import('express').RequestHandler;
  checkPermission: import('@nugen/rbac').CheckPermissionFn;
  creditService?: import('../credit/credit.service').CreditServiceResult;
}
