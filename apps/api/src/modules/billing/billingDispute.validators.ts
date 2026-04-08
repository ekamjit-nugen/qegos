import { body, param, query } from 'express-validator';
import type { ValidationChain } from 'express-validator';

export function validateCreateDispute(): ValidationChain[] {
  return [
    body('orderId')
      .trim().notEmpty().withMessage('Order ID is required')
      .isMongoId().withMessage('Order ID must be a valid ID'),
    body('paymentId')
      .trim().notEmpty().withMessage('Payment ID is required')
      .isMongoId().withMessage('Payment ID must be a valid ID'),
    body('disputeType')
      .trim().notEmpty().withMessage('Dispute type is required')
      .isIn(['overcharge', 'service_not_delivered', 'quality_issue', 'incorrect_amount', 'duplicate_charge', 'unauthorised'])
      .withMessage('Invalid dispute type'),
    body('disputedAmount')
      .notEmpty().withMessage('Disputed amount is required')
      .isInt({ min: 1 }).withMessage('Disputed amount must be a positive integer (cents)')
      .toInt(),
    body('clientStatement')
      .trim().notEmpty().withMessage('Client statement is required')
      .isLength({ max: 2000 }).withMessage('Client statement must be at most 2000 characters'),
    body('ticketId')
      .optional().trim().isMongoId().withMessage('Ticket ID must be a valid ID'),
  ];
}

export function validateUpdateDispute(): ValidationChain[] {
  return [
    param('id').trim().notEmpty().isMongoId().withMessage('Dispute ID must be a valid ID'),
    body('status')
      .optional()
      .isIn(['investigating', 'pending_approval', 'approved', 'rejected', 'completed'])
      .withMessage('Invalid status'),
    body('staffAssessment')
      .optional().trim().isLength({ max: 2000 })
      .withMessage('Staff assessment must be at most 2000 characters'),
    body('resolution')
      .optional()
      .isIn(['full_refund', 'partial_refund', 'credit_issued', 'no_action', 'service_redo', 'discount_applied'])
      .withMessage('Invalid resolution'),
    body('resolvedAmount')
      .optional().isInt({ min: 0 }).withMessage('Resolved amount must be a non-negative integer (cents)')
      .toInt(),
  ];
}

export function validateDisputeId(): ValidationChain[] {
  return [
    param('id').trim().notEmpty().isMongoId().withMessage('Dispute ID must be a valid ID'),
  ];
}

export function validateListDisputes(): ValidationChain[] {
  return [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status')
      .optional()
      .isIn(['raised', 'investigating', 'pending_approval', 'approved', 'rejected', 'completed']),
    query('disputeType')
      .optional()
      .isIn(['overcharge', 'service_not_delivered', 'quality_issue', 'incorrect_amount', 'duplicate_charge', 'unauthorised']),
  ];
}
