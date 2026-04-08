export type ReviewStatus_Rep = 'requested' | 'submitted' | 'flagged' | 'responded';

export const REVIEW_STATUS_LABELS_REP: Record<ReviewStatus_Rep, string> = {
  requested: 'Requested',
  submitted: 'Submitted',
  flagged: 'Flagged',
  responded: 'Responded',
};

export const REVIEW_STATUS_COLORS_REP: Record<ReviewStatus_Rep, string> = {
  requested: 'default',
  submitted: 'blue',
  flagged: 'red',
  responded: 'green',
};

export interface Review {
  _id: string;
  userId: string;
  orderId?: string;
  staffId?: string;
  rating: number;
  npsScore?: number;
  comment?: string;
  tags: string[];
  googleReviewPrompted: boolean;
  googleReviewClicked: boolean;
  adminResponse?: string;
  status: ReviewStatus_Rep;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewListQuery_Rep {
  page?: number;
  limit?: number;
  status?: ReviewStatus_Rep;
  minRating?: number;
}
