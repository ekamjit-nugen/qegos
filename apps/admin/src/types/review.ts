export type ReviewStatus =
  | 'pending_review'
  | 'in_review'
  | 'changes_requested'
  | 'approved'
  | 'rejected';

export const REVIEW_STATUSES: ReviewStatus[] = [
  'pending_review',
  'in_review',
  'changes_requested',
  'approved',
  'rejected',
];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending_review: 'Pending Review',
  in_review: 'In Review',
  changes_requested: 'Changes Requested',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const REVIEW_STATUS_COLORS: Record<ReviewStatus, string> = {
  pending_review: 'orange',
  in_review: 'blue',
  changes_requested: 'gold',
  approved: 'green',
  rejected: 'red',
};

export interface ReviewChecklistItem {
  item: string;
  checked: boolean;
  note?: string;
}

export interface ReviewChangeRequest {
  field: string;
  issue: string;
  instruction: string;
  resolvedAt?: string;
}

export interface ReviewAssignment {
  _id: string;
  orderId: string;
  preparerId: string;
  reviewerId: string;
  status: ReviewStatus;
  checklist: ReviewChecklistItem[];
  reviewNotes?: string;
  changesRequested: ReviewChangeRequest[];
  changesResolvedCount: number;
  approvedAt?: string;
  rejectedAt?: string;
  rejectedReason?: string;
  reviewRound: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewListQuery {
  page?: number;
  limit?: number;
  status?: ReviewStatus;
  reviewerId?: string;
  preparerId?: string;
}
