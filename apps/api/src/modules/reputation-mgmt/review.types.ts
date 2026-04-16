import type { Document, Types } from 'mongoose';

// ─── Review Status ─────────────────────────────────────────────────────────

export type ReviewStatus = 'requested' | 'submitted' | 'flagged' | 'responded';

export const REVIEW_STATUSES: ReviewStatus[] = ['requested', 'submitted', 'flagged', 'responded'];

// ─── Review Tags ───────────────────────────────────────────────────────────

export type ReviewTag =
  | 'quick_filing'
  | 'friendly_staff'
  | 'good_communication'
  | 'thorough_review'
  | 'too_slow'
  | 'pricing_concern'
  | 'missing_documents'
  | 'great_refund';

export const REVIEW_TAGS: ReviewTag[] = [
  'quick_filing',
  'friendly_staff',
  'good_communication',
  'thorough_review',
  'too_slow',
  'pricing_concern',
  'missing_documents',
  'great_refund',
];

// ─── Review Interface ──────────────────────────────────────────────────────

export interface IReview {
  userId: Types.ObjectId;
  orderId: Types.ObjectId;
  staffId?: Types.ObjectId;
  rating?: number; // 1-5
  npsScore?: number; // 0-10
  comment?: string;
  tags: ReviewTag[];
  googleReviewPrompted: boolean;
  googleReviewClicked: boolean;
  isPublic: boolean;
  adminResponse?: string;
  adminRespondedBy?: Types.ObjectId;
  adminRespondedAt?: Date;
  status: ReviewStatus;
  requestSentAt?: Date;
  reminderSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReviewDocument extends IReview, Document {
  _id: Types.ObjectId;
}

// ─── NPS Categories ────────────────────────────────────────────────────────

export function getNpsCategory(score: number): 'promoter' | 'passive' | 'detractor' {
  if (score >= 9) {
    return 'promoter';
  }
  if (score >= 7) {
    return 'passive';
  }
  return 'detractor';
}

// ─── Route Dependencies ────────────────────────────────────────────────────

export interface ReviewRouteDeps {
  ReviewModel: import('mongoose').Model<IReviewDocument>;
  /* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose Model<T> invariance; app passes Model<IFooDocument> */
  OrderModel: import('mongoose').Model<any>;
  UserModel: import('mongoose').Model<any>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  authenticate: () => import('express').RequestHandler;
  checkPermission: import('@nugen/rbac').CheckPermissionFn;
}
