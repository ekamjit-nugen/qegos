import { body, param, query } from 'express-validator';
import type { ValidationChain } from 'express-validator';
import { REVIEW_STATUSES, REVIEW_TAGS } from './review.types';

export function validateRequestReview(): ValidationChain[] {
  return [
    param('orderId')
      .trim().notEmpty().isMongoId().withMessage('Order ID must be a valid ID'),
  ];
}

export function validateSubmitReview(): ValidationChain[] {
  return [
    body('orderId')
      .trim().notEmpty().withMessage('Order ID is required')
      .isMongoId().withMessage('Order ID must be a valid ID'),
    body('rating')
      .notEmpty().withMessage('Rating is required')
      .isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5')
      .toInt(),
    body('npsScore')
      .optional()
      .isInt({ min: 0, max: 10 }).withMessage('NPS score must be between 0 and 10')
      .toInt(),
    body('comment')
      .optional().trim()
      .isLength({ max: 2000 }).withMessage('Comment must be at most 2000 characters'),
    body('tags')
      .optional().isArray().withMessage('Tags must be an array'),
    body('tags.*')
      .optional().isIn(REVIEW_TAGS).withMessage('Invalid review tag'),
  ];
}

export function validateRespondReview(): ValidationChain[] {
  return [
    param('id').trim().notEmpty().isMongoId().withMessage('Review ID must be a valid ID'),
    body('response')
      .trim().notEmpty().withMessage('Response is required')
      .isLength({ max: 2000 }).withMessage('Response must be at most 2000 characters'),
  ];
}

export function validateReviewId(): ValidationChain[] {
  return [
    param('id').trim().notEmpty().isMongoId().withMessage('Review ID must be a valid ID'),
  ];
}

export function validateListReviews(): ValidationChain[] {
  return [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional().isIn(REVIEW_STATUSES),
    query('rating').optional().isInt({ min: 1, max: 5 }).toInt(),
    query('staffId').optional().isMongoId(),
  ];
}
