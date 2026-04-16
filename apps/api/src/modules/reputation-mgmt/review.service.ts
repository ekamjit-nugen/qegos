import type { Model, Types } from 'mongoose';
import { AppError } from '@nugen/error-handler';
import type { IReviewDocument, ReviewStatus } from './review.types';
import { getNpsCategory } from './review.types';

// ─── Module State ───────────────────────────────────────────────────────────

let ReviewModel: Model<IReviewDocument>;
let OrderModel: Model<any>;

export function initReviewService(deps: {
  ReviewModel: Model<IReviewDocument>;
  OrderModel: Model<any>;
  UserModel: Model<any>;
}): void {
  ReviewModel = deps.ReviewModel;
  OrderModel = deps.OrderModel;
  // UserModel reserved for future use
  void deps.UserModel;
}

// ─── Request Review ─────────────────────────────────────────────────────────

export async function requestReview(orderId: string): Promise<IReviewDocument> {
  const order = await OrderModel.findById(orderId);
  if (!order) {
    throw AppError.notFound('Order');
  }

  // REV-INV-05: Verify payment succeeded before requesting review
  if (order.paymentStatus !== 'succeeded') {
    throw AppError.badRequest('Cannot request review: payment not completed');
  }

  // Check if review already exists for this order+user
  const existing = await ReviewModel.findOne({ orderId, userId: order.userId });
  if (existing) {
    return existing;
  }

  return ReviewModel.create({
    orderId,
    userId: order.userId,
    staffId: order.assignedStaffId || undefined,
    status: 'requested' as ReviewStatus,
    requestSentAt: new Date(),
  });
}

// ─── Submit Review ──────────────────────────────────────────────────────────

export interface SubmitReviewParams {
  orderId: string;
  userId: string;
  rating: number;
  npsScore?: number;
  comment?: string;
  tags?: string[];
}

export async function submitReview(
  params: SubmitReviewParams,
): Promise<{ review: IReviewDocument; googlePrompt: boolean }> {
  const { orderId, userId, rating, npsScore, comment, tags } = params;

  // Ownership: the caller must own the order they're reviewing. Without
  // this check, any authenticated user can drop 1-star reviews on anyone's
  // order (reputation poisoning) or plant 5-star reviews on behalf of others.
  const order = await OrderModel.findById(orderId).select('userId').lean<{ userId?: unknown }>();
  if (!order) {
    throw AppError.notFound('Order');
  }
  if (String(order.userId) !== String(userId)) {
    throw AppError.forbidden('Cannot review an order that does not belong to you');
  }

  // REV-INV-02: One review per {orderId, userId} — upsert
  let review = await ReviewModel.findOne({ orderId, userId });

  // Terminal states: submitted & flagged should never be silently overwritten.
  // Re-submitting a flagged review would un-flag it (status regression); a
  // submitted review is final per REV-INV-02.
  if (review && (review.status === 'submitted' || review.status === 'flagged')) {
    throw AppError.badRequest('Review already submitted for this order');
  }

  if (!review) {
    review = new ReviewModel({ orderId, userId });
  }

  review.rating = rating;
  if (npsScore !== undefined) {
    review.npsScore = npsScore;
  }
  if (comment !== undefined) {
    review.comment = comment;
  }
  if (tags) {
    review.tags = tags as IReviewDocument['tags'];
  }
  review.status = 'submitted';

  // REV-INV-01: Google review prompt is always shown (unconditional)
  review.googleReviewPrompted = true;

  await review.save();

  // Flag low ratings internally
  if (rating <= 2) {
    await flagLowRating(review);
  }

  return { review, googlePrompt: true };
}

// ─── Log Google Click ───────────────────────────────────────────────────────

export async function logGoogleClick(reviewId: string, userId: string): Promise<IReviewDocument> {
  const review = await ReviewModel.findById(reviewId);
  if (!review) {
    throw AppError.notFound('Review');
  }

  // Ownership: only the review author may flip their own googleReviewClicked
  // flag. Otherwise any user could pollute another user's engagement metric.
  if (String(review.userId) !== String(userId)) {
    throw AppError.forbidden('Cannot log Google click on a review you did not submit');
  }

  review.googleReviewClicked = true;
  await review.save();
  return review;
}

// ─── Admin: Respond to Review ───────────────────────────────────────────────

export async function respondToReview(
  reviewId: string,
  adminUserId: string,
  response: string,
): Promise<IReviewDocument> {
  const review = await ReviewModel.findById(reviewId);
  if (!review) {
    throw AppError.notFound('Review');
  }

  // State guard: only actually-existing reviews can be responded to. 'requested'
  // means the client hasn't submitted anything yet; responding pre-fabricates
  // a response to nothing. 'responded' is allowed so admins can edit replies.
  const allowed: ReviewStatus[] = ['submitted', 'flagged', 'responded'];
  if (!allowed.includes(review.status)) {
    throw AppError.badRequest(`Cannot respond to a review in status '${review.status}'`);
  }

  review.adminResponse = response;
  review.adminRespondedBy = adminUserId as unknown as Types.ObjectId;
  review.adminRespondedAt = new Date();
  review.status = 'responded';
  await review.save();

  return review;
}

// ─── List Reviews (Admin) ───────────────────────────────────────────────────

export interface ListReviewsParams {
  status?: string;
  rating?: number;
  staffId?: string;
  page?: number;
  limit?: number;
}

export async function listReviews(
  params: ListReviewsParams,
): Promise<{ reviews: IReviewDocument[]; total: number }> {
  const { status, rating, staffId, page = 1, limit = 20 } = params;

  const filter: Record<string, unknown> = {};
  if (status) {
    filter.status = status;
  }
  if (rating) {
    filter.rating = rating;
  }
  if (staffId) {
    filter.staffId = staffId;
  }

  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    ReviewModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ReviewModel.countDocuments(filter),
  ]);

  return { reviews: reviews as unknown as IReviewDocument[], total };
}

// ─── Public Reviews ─────────────────────────────────────────────────────────

export async function getPublicReviews(
  page = 1,
  limit = 10,
): Promise<{ reviews: IReviewDocument[]; total: number }> {
  const filter = { isPublic: true, status: 'submitted' };
  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    ReviewModel.find(filter)
      .sort({ rating: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('rating comment tags createdAt')
      .lean(),
    ReviewModel.countDocuments(filter),
  ]);

  return { reviews: reviews as unknown as IReviewDocument[], total };
}

// ─── Stats (Admin) ──────────────────────────────────────────────────────────

export async function getStats(): Promise<{
  totalReviews: number;
  averageRating: number;
  ratingHistogram: Record<number, number>;
  nps: { promoters: number; passives: number; detractors: number; score: number };
  byStaff: Array<{ _id: string; avgRating: number; count: number }>;
  byMonth: Array<{ _id: { year: number; month: number }; count: number; avgRating: number }>;
}> {
  const [totalReviews, ratingAgg, histogramAgg, npsAgg, byStaff, byMonth] = await Promise.all([
    ReviewModel.countDocuments({ status: { $in: ['submitted', 'responded'] } }),
    ReviewModel.aggregate([
      { $match: { rating: { $exists: true } } },
      { $group: { _id: null, avg: { $avg: '$rating' } } },
    ]),
    ReviewModel.aggregate([
      { $match: { rating: { $exists: true } } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]),
    ReviewModel.aggregate([
      { $match: { npsScore: { $exists: true } } },
      { $group: { _id: null, scores: { $push: '$npsScore' } } },
    ]),
    ReviewModel.aggregate([
      { $match: { staffId: { $exists: true }, rating: { $exists: true } } },
      {
        $group: {
          _id: '$staffId',
          avgRating: { $avg: '$rating' },
          count: { $sum: 1 },
        },
      },
      { $sort: { avgRating: -1 } },
    ]),
    ReviewModel.aggregate([
      { $match: { status: { $in: ['submitted', 'responded'] } } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: 1 },
          avgRating: { $avg: '$rating' },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
    ]),
  ]);

  const averageRating = ratingAgg[0]?.avg ?? 0;

  const ratingHistogram: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const item of histogramAgg) {
    ratingHistogram[item._id as number] = item.count as number;
  }

  // Calculate NPS
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  const allScores: number[] = npsAgg[0]?.scores ?? [];
  for (const score of allScores) {
    const cat = getNpsCategory(score);
    if (cat === 'promoter') {
      promoters++;
    } else if (cat === 'passive') {
      passives++;
    } else {
      detractors++;
    }
  }
  const totalNps = allScores.length;
  const npsScore = totalNps > 0 ? Math.round(((promoters - detractors) / totalNps) * 100) : 0;

  return {
    totalReviews,
    averageRating: Math.round(averageRating * 100) / 100,
    ratingHistogram,
    nps: { promoters, passives, detractors, score: npsScore },
    byStaff,
    byMonth,
  };
}

// ─── Cron: Send Review Reminders ────────────────────────────────────────────

export async function sendReviewReminders(): Promise<number> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Reviews requested 7+ days ago with no submission and no reminder sent yet
  const pendingReviews = await ReviewModel.find({
    status: 'requested',
    requestSentAt: { $lte: sevenDaysAgo },
    reminderSentAt: { $exists: false },
  });

  let sentCount = 0;
  for (const review of pendingReviews) {
    review.reminderSentAt = new Date();
    await review.save();
    sentCount++;
    // In production: emit notification event here
  }

  return sentCount;
}

// ─── Internal: Flag Low Ratings ─────────────────────────────────────────────

async function flagLowRating(review: IReviewDocument): Promise<void> {
  review.status = 'flagged';
  await review.save();
  // In production: emit escalation event
}
