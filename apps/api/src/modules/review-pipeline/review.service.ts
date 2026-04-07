import type { Model, FilterQuery } from 'mongoose';
import { AppError } from '@nugen/error-handler';
import type { IReviewAssignmentDocument, IChangeRequest } from './review.types';
import { DEFAULT_REVIEW_CHECKLIST } from './review.types';

export interface ReviewServiceDeps {
  ReviewAssignmentModel: Model<IReviewAssignmentDocument>;
  OrderModel: Model<Record<string, unknown>>;
  UserModel: Model<Record<string, unknown>>;
}

export interface ReviewServiceResult {
  submitForReview: (orderId: string, preparerId: string) => Promise<IReviewAssignmentDocument>;
  getPendingReviews: (reviewerId: string) => Promise<IReviewAssignmentDocument[]>;
  getReviewDetail: (orderId: string) => Promise<IReviewAssignmentDocument>;
  startReview: (orderId: string, reviewerId: string) => Promise<IReviewAssignmentDocument>;
  approveReview: (orderId: string, reviewerId: string) => Promise<IReviewAssignmentDocument>;
  requestChanges: (orderId: string, reviewerId: string, changes: IChangeRequest[], notes?: string) => Promise<IReviewAssignmentDocument>;
  rejectReview: (orderId: string, reviewerId: string, reason: string) => Promise<IReviewAssignmentDocument>;
  resolveChange: (orderId: string, changeIndex: number, preparerId: string) => Promise<IReviewAssignmentDocument>;
  getStats: () => Promise<Record<string, unknown>>;
}

// Senior-level user types
const SENIOR_USER_TYPES = [0, 1, 5, 6]; // super_admin, admin, office_manager, senior_staff
const ADMIN_USER_TYPES = [0, 1]; // super_admin, admin
const MANAGER_USER_TYPES = [0, 1, 5]; // super_admin, admin, office_manager

export function createReviewService(deps: ReviewServiceDeps): ReviewServiceResult {
  const { ReviewAssignmentModel, OrderModel, UserModel } = deps;

  /**
   * Assign a reviewer based on PRD rules:
   * 1. Self-review block (RVW-INV-02)
   * 2. Seniority gate: junior → senior/admin
   * 3. Complexity gate: >3 line items or rental/CGT/foreign → senior/admin
   * 4. Manager review: >$500 or VIP
   * 5. Round-robin among eligible
   */
  async function assignReviewer(
    orderId: string,
    preparerId: string,
  ): Promise<string> {
    const order = await OrderModel.findById(orderId).lean() as Record<string, unknown> | null;
    if (!order) throw AppError.notFound('Order');

    const lineItems = (order.lineItems ?? []) as Array<Record<string, unknown>>;
    const incomeDetails = (order.incomeDetails ?? {}) as Record<string, boolean>;
    const finalAmount = (order.finalAmount ?? 0) as number;

    // Determine complexity
    const isComplex =
      lineItems.length > 3 ||
      incomeDetails.rentalIncome === true ||
      incomeDetails.capitalGains === true ||
      incomeDetails.foreignIncome === true;

    const isHighValue = finalAmount > 50000; // $500 in cents

    // Determine required reviewer level
    let requiredUserTypes: number[];
    if (isHighValue) {
      requiredUserTypes = MANAGER_USER_TYPES;
    } else if (isComplex) {
      requiredUserTypes = SENIOR_USER_TYPES;
    } else {
      requiredUserTypes = SENIOR_USER_TYPES;
    }

    // Find eligible reviewers (RVW-INV-02: exclude preparer)
    const eligibleReviewers = await UserModel.find({
      _id: { $ne: preparerId },
      userType: { $in: requiredUserTypes },
      status: true,
      isDeleted: { $ne: true },
    })
      .select('_id')
      .lean() as Array<{ _id: string }>;

    if (eligibleReviewers.length === 0) {
      throw AppError.badRequest('No eligible reviewers available. Ensure senior staff are active.');
    }

    // Round-robin: pick reviewer with fewest pending reviews
    const reviewCounts = await ReviewAssignmentModel.aggregate([
      {
        $match: {
          reviewerId: { $in: eligibleReviewers.map((r) => r._id) },
          status: { $in: ['pending_review', 'in_review'] },
        },
      },
      { $group: { _id: '$reviewerId', count: { $sum: 1 } } },
    ]) as Array<{ _id: string; count: number }>;

    const countMap = new Map(reviewCounts.map((r) => [r._id.toString(), r.count]));

    // Sort by count ascending, pick first
    eligibleReviewers.sort(
      (a, b) => (countMap.get(a._id.toString()) ?? 0) - (countMap.get(b._id.toString()) ?? 0),
    );

    return eligibleReviewers[0]._id.toString();
  }

  // ─── Submit for Review ────────────────────────────────────────────────

  async function submitForReview(
    orderId: string,
    preparerId: string,
  ): Promise<IReviewAssignmentDocument> {
    // Check if review already exists for this order
    const existing = await ReviewAssignmentModel.findOne({ orderId });
    if (existing && (existing.status === 'pending_review' || existing.status === 'in_review')) {
      throw AppError.conflict('A review is already pending for this order');
    }

    // Assign reviewer
    const reviewerId = await assignReviewer(orderId, preparerId);

    // If resubmission after changes_requested, update existing
    if (existing && existing.status === 'changes_requested') {
      existing.status = 'pending_review';
      existing.reviewRound += 1;

      // RVW-INV-05: Auto-escalate if round > 3
      if (existing.reviewRound > 3) {
        // Find an admin
        const admin = await UserModel.findOne({
          userType: { $in: ADMIN_USER_TYPES },
          status: true,
          isDeleted: { $ne: true },
          _id: { $ne: preparerId },
        }).lean() as { _id: string } | null;

        if (admin) {
          existing.reviewerId = admin._id as unknown as IReviewAssignmentDocument['reviewerId'];
        }
      }

      await existing.save();

      // Update order status to Review (5)
      await OrderModel.findByIdAndUpdate(orderId, { status: 5 });

      return existing;
    }

    // Create new review assignment
    const review = await ReviewAssignmentModel.create({
      orderId,
      preparerId,
      reviewerId,
      status: 'pending_review',
      checklist: DEFAULT_REVIEW_CHECKLIST.map((c) => ({ ...c })),
      changesRequested: [],
      changesResolvedCount: 0,
      reviewRound: 1,
    });

    // Update order status to Review (5)
    await OrderModel.findByIdAndUpdate(orderId, { status: 5 });

    return review;
  }

  // ─── Get Pending Reviews ──────────────────────────────────────────────

  async function getPendingReviews(reviewerId: string): Promise<IReviewAssignmentDocument[]> {
    return ReviewAssignmentModel.find({
      reviewerId,
      status: { $in: ['pending_review', 'in_review'] },
    })
      .populate('orderId', 'orderNumber financialYear personalDetails.firstName personalDetails.lastName finalAmount')
      .populate('preparerId', 'firstName lastName')
      .sort({ createdAt: 1 })
      .lean<IReviewAssignmentDocument[]>();
  }

  // ─── Get Review Detail ────────────────────────────────────────────────

  async function getReviewDetail(orderId: string): Promise<IReviewAssignmentDocument> {
    const review = await ReviewAssignmentModel.findOne({ orderId })
      .populate('orderId')
      .populate('preparerId', 'firstName lastName email')
      .populate('reviewerId', 'firstName lastName email')
      .lean<IReviewAssignmentDocument>();
    if (!review) throw AppError.notFound('Review assignment');
    return review;
  }

  // ─── Start Review ─────────────────────────────────────────────────────

  async function startReview(
    orderId: string,
    reviewerId: string,
  ): Promise<IReviewAssignmentDocument> {
    const review = await ReviewAssignmentModel.findOne({ orderId });
    if (!review) throw AppError.notFound('Review assignment');

    if (review.reviewerId.toString() !== reviewerId) {
      throw AppError.forbidden('Only the assigned reviewer can start this review');
    }

    if (review.status !== 'pending_review') {
      throw AppError.badRequest(`Cannot start review from status: ${review.status}`);
    }

    review.status = 'in_review';
    await review.save();
    return review;
  }

  // ─── Approve Review (RVW-INV-03, RVW-INV-04) ─────────────────────────

  async function approveReview(
    orderId: string,
    reviewerId: string,
  ): Promise<IReviewAssignmentDocument> {
    const review = await ReviewAssignmentModel.findOne({ orderId });
    if (!review) throw AppError.notFound('Review assignment');

    if (review.reviewerId.toString() !== reviewerId) {
      throw AppError.forbidden('Only the assigned reviewer can approve');
    }

    if (review.status !== 'in_review') {
      throw AppError.badRequest(`Cannot approve from status: ${review.status}`);
    }

    // RVW-INV-03: ALL checklist items must be checked
    const uncheckedItems = review.checklist.filter((c) => !c.checked);
    if (uncheckedItems.length > 0) {
      throw AppError.badRequest(
        `Cannot approve: ${uncheckedItems.length} checklist item(s) remain unchecked`,
        uncheckedItems.map((c) => ({ field: 'checklist', message: `Unchecked: ${c.item}` })),
      );
    }

    review.status = 'approved';
    review.approvedAt = new Date();

    // Calculate time to review
    const createdAt = review.createdAt ?? new Date();
    review.timeToReview = Math.round(
      (Date.now() - new Date(createdAt).getTime()) / (1000 * 60),
    );

    await review.save();

    // Order unlocked for lodgement — status stays at Review(5), but review is approved
    // The order can now transition 5→6 (Completed)

    return review;
  }

  // ─── Request Changes (RVW-INV-05) ─────────────────────────────────────

  async function requestChanges(
    orderId: string,
    reviewerId: string,
    changes: IChangeRequest[],
    notes?: string,
  ): Promise<IReviewAssignmentDocument> {
    const review = await ReviewAssignmentModel.findOne({ orderId });
    if (!review) throw AppError.notFound('Review assignment');

    if (review.reviewerId.toString() !== reviewerId) {
      throw AppError.forbidden('Only the assigned reviewer can request changes');
    }

    if (review.status !== 'in_review') {
      throw AppError.badRequest(`Cannot request changes from status: ${review.status}`);
    }

    review.status = 'changes_requested';
    review.changesRequested.push(...(changes as IReviewAssignmentDocument['changesRequested']));
    if (notes) review.reviewNotes = notes;

    await review.save();

    // Order status back to InProgress (4)
    await OrderModel.findByIdAndUpdate(orderId, { status: 4 });

    return review;
  }

  // ─── Reject Review ────────────────────────────────────────────────────

  async function rejectReview(
    orderId: string,
    reviewerId: string,
    reason: string,
  ): Promise<IReviewAssignmentDocument> {
    const review = await ReviewAssignmentModel.findOne({ orderId });
    if (!review) throw AppError.notFound('Review assignment');

    if (review.reviewerId.toString() !== reviewerId) {
      throw AppError.forbidden('Only the assigned reviewer can reject');
    }

    if (review.status !== 'in_review' && review.status !== 'pending_review') {
      throw AppError.badRequest(`Cannot reject from status: ${review.status}`);
    }

    review.status = 'rejected';
    review.rejectedAt = new Date();
    review.rejectedReason = reason;
    await review.save();

    return review;
  }

  // ─── Resolve Change ───────────────────────────────────────────────────

  async function resolveChange(
    orderId: string,
    changeIndex: number,
    preparerId: string,
  ): Promise<IReviewAssignmentDocument> {
    const review = await ReviewAssignmentModel.findOne({ orderId });
    if (!review) throw AppError.notFound('Review assignment');

    if (review.preparerId.toString() !== preparerId) {
      throw AppError.forbidden('Only the preparer can resolve changes');
    }

    if (review.status !== 'changes_requested') {
      throw AppError.badRequest('Changes can only be resolved when status is changes_requested');
    }

    if (changeIndex < 0 || changeIndex >= review.changesRequested.length) {
      throw AppError.badRequest('Invalid change index');
    }

    const change = review.changesRequested[changeIndex];
    if (change.resolvedAt) {
      throw AppError.badRequest('This change has already been resolved');
    }

    change.resolvedBy = preparerId as unknown as IChangeRequest['resolvedBy'];
    change.resolvedAt = new Date();
    review.changesResolvedCount += 1;
    review.markModified('changesRequested');
    await review.save();

    return review;
  }

  // ─── Stats (RVW-INV-06) ──────────────────────────────────────────────

  async function getStats(): Promise<Record<string, unknown>> {
    const [avgTime, approvalRate, byReviewer, byPreparer] = await Promise.all([
      // Average time to review
      ReviewAssignmentModel.aggregate([
        { $match: { status: 'approved', timeToReview: { $exists: true } } },
        { $group: { _id: null, avgMinutes: { $avg: '$timeToReview' } } },
      ]),
      // Approval rate
      ReviewAssignmentModel.aggregate([
        { $match: { status: { $in: ['approved', 'rejected', 'changes_requested'] } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
          },
        },
      ]),
      // By reviewer
      ReviewAssignmentModel.aggregate([
        {
          $group: {
            _id: '$reviewerId',
            total: { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
            avgRounds: { $avg: '$reviewRound' },
            avgTime: { $avg: '$timeToReview' },
          },
        },
      ]),
      // By preparer
      ReviewAssignmentModel.aggregate([
        {
          $group: {
            _id: '$preparerId',
            total: { $sum: 1 },
            changesRequested: { $sum: { $cond: [{ $eq: ['$status', 'changes_requested'] }, 1, 0] } },
            avgRounds: { $avg: '$reviewRound' },
          },
        },
      ]),
    ]);

    return {
      avgTimeToReview: avgTime[0]?.avgMinutes ?? 0,
      approvalRate: approvalRate[0]
        ? {
            total: approvalRate[0].total,
            approved: approvalRate[0].approved,
            rate: approvalRate[0].total > 0
              ? Math.round((approvalRate[0].approved / approvalRate[0].total) * 100)
              : 0,
          }
        : { total: 0, approved: 0, rate: 0 },
      byReviewer,
      byPreparer,
    };
  }

  return {
    submitForReview,
    getPendingReviews,
    getReviewDetail,
    startReview,
    approveReview,
    requestChanges,
    rejectReview,
    resolveChange,
    getStats,
  };
}
