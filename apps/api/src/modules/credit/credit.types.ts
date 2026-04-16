import type { Document, Types } from 'mongoose';

// ─── Credit Transaction Types ──────────────────────────────────────────────

export const CREDIT_TYPES = [
  'referral_reward',
  'promo_credit',
  'refund_credit',
  'usage',
  'expiry',
] as const;
export type CreditType = (typeof CREDIT_TYPES)[number];

export interface ICreditTransaction {
  userId: Types.ObjectId;
  type: CreditType;
  amount: number; // cents — positive = credit added, negative = credit used
  balance: number; // running balance after this transaction
  referenceId?: string; // referral ID, order ID, refund ID
  description: string;
  expiresAt?: Date;
  createdAt: Date;
}

export interface ICreditTransactionDocument extends ICreditTransaction, Document {
  _id: Types.ObjectId;
}
