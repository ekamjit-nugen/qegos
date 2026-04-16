import { Schema, type Connection, type Model } from 'mongoose';
import type { IReviewDocument } from './review.types';
import { REVIEW_STATUSES, REVIEW_TAGS } from './review.types';

const reviewSchema = new Schema<IReviewDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, min: 1, max: 5 },
    npsScore: { type: Number, min: 0, max: 10 },
    comment: { type: String, maxlength: 2000 },
    tags: [
      {
        type: String,
        enum: REVIEW_TAGS,
      },
    ],
    googleReviewPrompted: { type: Boolean, default: false },
    googleReviewClicked: { type: Boolean, default: false },
    isPublic: { type: Boolean, default: false },
    adminResponse: { type: String, maxlength: 2000 },
    adminRespondedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    adminRespondedAt: { type: Date },
    status: {
      type: String,
      required: true,
      enum: REVIEW_STATUSES,
      default: 'requested',
    },
    requestSentAt: { type: Date },
    reminderSentAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'reviews',
  },
);

// REV-INV-02: One review per {orderId, userId}
reviewSchema.index({ orderId: 1, userId: 1 }, { unique: true });
reviewSchema.index({ userId: 1 });
reviewSchema.index({ staffId: 1 });
reviewSchema.index({ rating: 1 });
reviewSchema.index({ status: 1, createdAt: -1 });
reviewSchema.index({ isPublic: 1, rating: -1 });

export function createReviewModel(connection: Connection): Model<IReviewDocument> {
  if (connection.models.Review) {
    return connection.models.Review as Model<IReviewDocument>;
  }
  return connection.model<IReviewDocument>('Review', reviewSchema);
}
