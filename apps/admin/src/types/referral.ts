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

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  pending: 'Pending',
  signed_up: 'Signed Up',
  order_created: 'Order Created',
  completed: 'Completed',
  rewarded: 'Rewarded',
  expired: 'Expired',
};

export const REFERRAL_STATUS_COLORS: Record<ReferralStatus, string> = {
  pending: 'default',
  signed_up: 'blue',
  order_created: 'cyan',
  completed: 'green',
  rewarded: 'gold',
  expired: 'red',
};

export interface Referral {
  _id: string;
  referralCode: string;
  referrerId: string;
  refereeId?: string;
  status: ReferralStatus;
  rewardType?: string;
  referrerRewardAmount?: number; // cents
  refereeRewardAmount?: number; // cents
  referrerRewarded: boolean;
  refereeRewarded: boolean;
  channel?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReferralConfig {
  isEnabled: boolean;
  rewardType: string;
  referrerRewardValue: number; // cents
  refereeRewardValue: number; // cents
  maxReferralsPerClient: number;
  referralExpiryDays: number;
  minimumOrderValueForReward: number; // cents
}

export interface ReferralListQuery {
  page?: number;
  limit?: number;
  status?: ReferralStatus;
  referrerId?: string;
}
