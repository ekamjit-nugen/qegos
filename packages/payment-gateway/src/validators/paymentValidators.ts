import { body, param, query } from 'express-validator';
import type { ValidationChain } from 'express-validator';

/**
 * Validation for POST /payments/intent
 * PAY-INV-01: idempotencyKey required, UUID v4
 * PAY-INV-02: amount as integer cents
 */
export function createIntentValidation(): ValidationChain[] {
  return [
    body('orderId')
      .trim()
      .notEmpty()
      .withMessage('Order ID is required')
      .isMongoId()
      .withMessage('Order ID must be a valid ID'),
    body('idempotencyKey')
      .trim()
      .notEmpty()
      .withMessage('Idempotency key is required')
      .isUUID(4)
      .withMessage('Idempotency key must be a valid UUID v4'),
    body('gateway')
      .optional()
      .isIn(['stripe', 'payroo'])
      .withMessage('Gateway must be "stripe" or "payroo"'),
    body('amount')
      .notEmpty()
      .withMessage('Amount is required')
      .isInt({ min: 1 })
      .withMessage('Amount must be a positive integer (cents)')
      .toInt(),
    body('currency')
      .optional()
      .trim()
      .isLength({ min: 3, max: 3 })
      .withMessage('Currency must be a 3-letter ISO 4217 code')
      .toUpperCase(),
  ];
}

/**
 * Validation for POST /payments/capture
 */
export function capturePaymentValidation(): ValidationChain[] {
  return [
    body('paymentId')
      .trim()
      .notEmpty()
      .withMessage('Payment ID is required')
      .isMongoId()
      .withMessage('Payment ID must be a valid ID'),
    body('idempotencyKey')
      .trim()
      .notEmpty()
      .withMessage('Idempotency key is required')
      .isUUID(4)
      .withMessage('Idempotency key must be a valid UUID v4'),
    body('amount')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Amount must be a positive integer (cents)')
      .toInt(),
  ];
}

/**
 * Validation for POST /payments/refund
 * BIL-INV-04: Amount drives approval gates (service layer)
 */
export function refundPaymentValidation(): ValidationChain[] {
  return [
    body('paymentId')
      .trim()
      .notEmpty()
      .withMessage('Payment ID is required')
      .isMongoId()
      .withMessage('Payment ID must be a valid ID'),
    body('amount')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Amount must be a positive integer (cents)')
      .toInt(),
    body('reason')
      .trim()
      .notEmpty()
      .withMessage('Reason is required')
      .isLength({ max: 500 })
      .withMessage('Reason must be at most 500 characters'),
    body('idempotencyKey')
      .trim()
      .notEmpty()
      .withMessage('Idempotency key is required')
      .isUUID(4)
      .withMessage('Idempotency key must be a valid UUID v4'),
  ];
}

/**
 * Validation for GET /payments/:id
 */
export function getPaymentValidation(): ValidationChain[] {
  return [
    param('id')
      .trim()
      .notEmpty()
      .withMessage('Payment ID is required')
      .isMongoId()
      .withMessage('Payment ID must be a valid ID'),
  ];
}

/**
 * Validation for GET /payments/order/:orderId
 */
export function getOrderPaymentsValidation(): ValidationChain[] {
  return [
    param('orderId')
      .trim()
      .notEmpty()
      .withMessage('Order ID is required')
      .isMongoId()
      .withMessage('Order ID must be a valid ID'),
  ];
}

/**
 * Validation for PUT /payments/config
 */
export function updateConfigValidation(): ValidationChain[] {
  return [
    body('primaryGateway')
      .optional()
      .isIn(['stripe', 'payroo'])
      .withMessage('Primary gateway must be "stripe" or "payroo"'),
    body('routingRule')
      .optional()
      .isIn(['primary_only', 'fallback', 'round_robin', 'amount_based'])
      .withMessage('Invalid routing rule'),
    body('amountThreshold')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Amount threshold must be a non-negative integer (cents)')
      .toInt(),
    body('stripeEnabled').optional().isBoolean().withMessage('stripeEnabled must be a boolean'),
    body('payrooEnabled').optional().isBoolean().withMessage('payrooEnabled must be a boolean'),
    body('fallbackTimeoutMs')
      .optional()
      .isInt({ min: 1000, max: 60000 })
      .withMessage('Fallback timeout must be between 1000 and 60000 ms')
      .toInt(),
    body('maintenanceMode').optional().isBoolean().withMessage('maintenanceMode must be a boolean'),
    body('maintenanceMessage')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Maintenance message must be at most 500 characters'),
  ];
}

/**
 * Validation for GET /payments/logs
 */
export function getPaymentLogsValidation(): ValidationChain[] {
  return [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer')
      .toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
      .toInt(),
    query('gateway')
      .optional()
      .isIn(['stripe', 'payroo'])
      .withMessage('Gateway must be "stripe" or "payroo"'),
    query('status')
      .optional()
      .isIn([
        'pending',
        'requires_capture',
        'authorised',
        'captured',
        'succeeded',
        'failed',
        'cancelled',
        'refund_pending',
        'refunded',
        'partially_refunded',
        'disputed',
      ])
      .withMessage('Invalid status'),
    query('dateFrom').optional().isISO8601().withMessage('dateFrom must be a valid ISO 8601 date'),
    query('dateTo').optional().isISO8601().withMessage('dateTo must be a valid ISO 8601 date'),
    query('amountMin')
      .optional()
      .isInt({ min: 0 })
      .withMessage('amountMin must be a non-negative integer')
      .toInt(),
    query('amountMax')
      .optional()
      .isInt({ min: 0 })
      .withMessage('amountMax must be a non-negative integer')
      .toInt(),
    query('sortBy')
      .optional()
      .isIn(['createdAt', 'amount', 'status'])
      .withMessage('sortBy must be createdAt, amount, or status'),
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('sortOrder must be asc or desc'),
  ];
}

/**
 * Validation for POST /payments/write-off
 * BIL-INV-05: 90+ days, 2+ contacts, admin approval
 */
export function writeOffValidation(): ValidationChain[] {
  return [
    body('paymentId')
      .trim()
      .notEmpty()
      .withMessage('Payment ID is required')
      .isMongoId()
      .withMessage('Payment ID must be a valid ID'),
    body('reason')
      .trim()
      .notEmpty()
      .withMessage('Reason is required')
      .isLength({ max: 1000 })
      .withMessage('Reason must be at most 1000 characters'),
    body('contactAttempts')
      .notEmpty()
      .withMessage('Contact attempts count is required')
      .isInt({ min: 2 })
      .withMessage('At least 2 contact attempts are required (BIL-INV-05)')
      .toInt(),
    body('contactLog')
      .trim()
      .notEmpty()
      .withMessage('Contact log is required')
      .isLength({ max: 2000 })
      .withMessage('Contact log must be at most 2000 characters'),
  ];
}

/**
 * Validation for POST /orders/:id/adjust-invoice
 */
export function adjustInvoiceValidation(): ValidationChain[] {
  return [
    param('id')
      .trim()
      .notEmpty()
      .withMessage('Order ID is required')
      .isMongoId()
      .withMessage('Order ID must be a valid ID'),
  ];
}
