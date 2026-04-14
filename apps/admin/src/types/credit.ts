export type CreditType = 'referral_reward' | 'promo_credit' | 'refund_credit' | 'usage' | 'expiry';

export interface CreditTransaction {
  _id: string;
  userId: string;
  type: CreditType;
  amount: number;
  balance: number;
  referenceId?: string;
  description: string;
  expiresAt?: string;
  createdAt: string;
}
