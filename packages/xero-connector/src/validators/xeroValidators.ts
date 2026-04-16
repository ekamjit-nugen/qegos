import { body, param, query } from 'express-validator';
import type { ValidationChain } from 'express-validator';

export function validateConfigUpdate(): ValidationChain[] {
  return [
    body('xeroRevenueAccountCode')
      .optional()
      .trim()
      .isLength({ max: 20 })
      .withMessage('Account code too long'),
    body('xeroBankAccountId').optional().trim().isLength({ max: 100 }),
    body('xeroGstAccountCode').optional().trim().isLength({ max: 20 }),
    body('xeroDefaultTaxType').optional().trim().isLength({ max: 20 }),
  ];
}

export function validateSyncContact(): ValidationChain[] {
  return [
    body('userId')
      .trim()
      .notEmpty()
      .withMessage('User ID is required')
      .isMongoId()
      .withMessage('User ID must be a valid ID'),
  ];
}

export function validateOrderId(): ValidationChain[] {
  return [
    param('orderId').trim().notEmpty().isMongoId().withMessage('Order ID must be a valid ID'),
  ];
}

export function validateSyncLogId(): ValidationChain[] {
  return [
    param('syncLogId').trim().notEmpty().isMongoId().withMessage('Sync log ID must be a valid ID'),
  ];
}

export function validateSyncLogList(): ValidationChain[] {
  return [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('entityType').optional().isIn(['contact', 'invoice', 'payment', 'credit_note']),
    query('status').optional().isIn(['queued', 'processing', 'success', 'failed']),
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601(),
  ];
}

export function validateReconciliation(): ValidationChain[] {
  return [
    body('dateFrom').optional().isISO8601().withMessage('dateFrom must be ISO 8601'),
    body('dateTo').optional().isISO8601().withMessage('dateTo must be ISO 8601'),
  ];
}

export function validateBulkSync(): ValidationChain[] {
  return [];
}

export function validateRecordPayment(): ValidationChain[] {
  return [
    body('paymentId')
      .trim()
      .notEmpty()
      .withMessage('Payment ID is required')
      .isMongoId()
      .withMessage('Payment ID must be a valid ID'),
  ];
}

export function validateCreditNote(): ValidationChain[] {
  return [
    body('orderId')
      .trim()
      .notEmpty()
      .withMessage('Order ID is required')
      .isMongoId()
      .withMessage('Order ID must be a valid ID'),
    body('refundAmountCents')
      .notEmpty()
      .withMessage('Refund amount is required')
      .isInt({ min: 1 })
      .withMessage('Refund amount must be a positive integer (cents)')
      .toInt(),
    body('reference').trim().notEmpty().withMessage('Reference is required').isLength({ max: 200 }),
  ];
}
