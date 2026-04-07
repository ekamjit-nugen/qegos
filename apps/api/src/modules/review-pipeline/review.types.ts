import type { Document, Types } from 'mongoose';

// ─── Review Status ──────────────────────────────────────────────────────────

export const REVIEW_STATUSES = [
  'pending_review',
  'in_review',
  'changes_requested',
  'approved',
  'rejected',
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

// ─── Review Assignment Interface ────────────────────────────────────────────

export interface IChecklistItem {
  item: string;
  checked: boolean;
  note?: string;
}

export interface IChangeRequest {
  field: string;
  issue: string;
  instruction: string;
  resolvedBy?: Types.ObjectId;
  resolvedAt?: Date;
}

export interface IReviewAssignment {
  orderId: Types.ObjectId;
  preparerId: Types.ObjectId;
  reviewerId: Types.ObjectId;
  status: ReviewStatus;
  checklist: IChecklistItem[];
  reviewNotes?: string;
  changesRequested: IChangeRequest[];
  changesResolvedCount: number;
  approvedAt?: Date;
  rejectedAt?: Date;
  rejectedReason?: string;
  reviewRound: number;
  timeToReview?: number; // minutes
}

export interface IReviewAssignmentDocument extends IReviewAssignment, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Default Checklist (PRD Section 7.7) ────────────────────────────────────

export const DEFAULT_REVIEW_CHECKLIST: IChecklistItem[] = [
  { item: 'Client identity verified (TFN matches, DOB matches)', checked: false },
  { item: 'All income sources accounted for (cross-check with prior year)', checked: false },
  { item: 'Deductions supported by documentation in vault', checked: false },
  { item: 'Medicare levy correctly applied (check residency, family status)', checked: false },
  { item: 'HECS-HELP correctly assessed (check debt status)', checked: false },
  { item: 'Private health insurance status verified', checked: false },
  { item: 'Capital gains discount correctly applied (holding period > 12 months)', checked: false },
  { item: 'Negative gearing calculations verified (if applicable)', checked: false },
  { item: 'Prior-year figures consistent with last year\'s return', checked: false },
  { item: 'Client engagement letter signed', checked: false },
  { item: 'All required documents uploaded to vault', checked: false },
  { item: 'Estimated refund/owing figure reasonable (no obvious errors)', checked: false },
];

// ─── Event Types ────────────────────────────────────────────────────────────

export type ReviewEvent =
  | 'review.submitted'
  | 'review.started'
  | 'review.approved'
  | 'review.changesRequested'
  | 'review.rejected'
  | 'review.escalated';
