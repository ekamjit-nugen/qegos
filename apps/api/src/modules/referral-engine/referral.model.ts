import { Schema, type Connection, type Model } from 'mongoose';
import type { IReferralDocument, IReferralConfigDocument } from './referral.types';
import { REFERRAL_STATUSES, REFERRAL_REWARD_TYPES, REFERRAL_CHANNELS, DEFAULT_REFERRAL_CONFIG } from './referral.types';

// ─── Referral Schema ───────────────────────────────────────────────────────

const referralSchema = new Schema<IReferralDocument>(
  {
    referralCode: { type: String, required: true },
    referrerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    refereeId: { type: Schema.Types.ObjectId, ref: 'User' },
    refereeLeadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
    status: {
      type: String,
      required: true,
      enum: REFERRAL_STATUSES,
      default: 'pending',
    },
    rewardType: { type: String, enum: REFERRAL_REWARD_TYPES },
    referrerRewardAmount: { type: Number },
    refereeRewardAmount: { type: Number },
    referrerRewarded: { type: Boolean, default: false },
    refereeRewarded: { type: Boolean, default: false },
    referrerOrderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    refereeOrderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    channel: { type: String, enum: REFERRAL_CHANNELS },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    collection: 'referrals',
  },
);

// REF-INV-05: Codes stored uppercase
referralSchema.pre('save', function (next) {
  if (this.referralCode) {
    this.referralCode = this.referralCode.toUpperCase();
  }
  next();
});

// Indexes
referralSchema.index({ referralCode: 1 });
referralSchema.index({ refereeId: 1 }, { unique: true, sparse: true }); // REF-INV-03
referralSchema.index({ referrerId: 1, createdAt: -1 });
referralSchema.index({ status: 1, expiresAt: 1 });

export function createReferralModel(connection: Connection): Model<IReferralDocument> {
  if (connection.models.Referral) {
    return connection.models.Referral as Model<IReferralDocument>;
  }
  return connection.model<IReferralDocument>('Referral', referralSchema);
}

// ─── Referral Config Schema (singleton) ────────────────────────────────────

const referralConfigSchema = new Schema<IReferralConfigDocument>(
  {
    isEnabled: { type: Boolean, default: true },
    rewardType: {
      type: String,
      required: true,
      enum: REFERRAL_REWARD_TYPES,
      default: DEFAULT_REFERRAL_CONFIG.rewardType,
    },
    referrerRewardValue: { type: Number, required: true, default: DEFAULT_REFERRAL_CONFIG.referrerRewardValue },
    refereeRewardValue: { type: Number, required: true, default: DEFAULT_REFERRAL_CONFIG.refereeRewardValue },
    maxReferralsPerClient: { type: Number, required: true, default: DEFAULT_REFERRAL_CONFIG.maxReferralsPerClient },
    referralExpiryDays: { type: Number, required: true, default: DEFAULT_REFERRAL_CONFIG.referralExpiryDays },
    minimumOrderValueForReward: { type: Number, required: true, default: DEFAULT_REFERRAL_CONFIG.minimumOrderValueForReward },
  },
  {
    timestamps: true,
    collection: 'referral_config',
  },
);

export function createReferralConfigModel(connection: Connection): Model<IReferralConfigDocument> {
  if (connection.models.ReferralConfig) {
    return connection.models.ReferralConfig as Model<IReferralConfigDocument>;
  }
  return connection.model<IReferralConfigDocument>('ReferralConfig', referralConfigSchema);
}
