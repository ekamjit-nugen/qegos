import { body, param, query } from 'express-validator';
import { VAULT_DOCUMENT_CATEGORIES, ATO_REFUND_STATUSES } from '../types';

// ─── Financial Year format: "YYYY-YY" ──────────────────────────────────────

const fyRegex = /^\d{4}-\d{2}$/;

// ─── Vault Document Validators ──────────────────────────────────────────────

export const uploadDocumentValidation = [
  body('financialYear')
    .isString().withMessage('financialYear is required')
    .matches(fyRegex).withMessage('financialYear must be YYYY-YY format'),
  body('category')
    .isString()
    .isIn(VAULT_DOCUMENT_CATEGORIES).withMessage('Invalid document category'),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 500 }).withMessage('Description max 500 characters'),
  body('tags')
    .optional()
    .isArray().withMessage('Tags must be an array'),
  body('tags.*')
    .optional()
    .isString()
    .isLength({ max: 50 }),
];

export const updateDocumentValidation = [
  param('id').isMongoId().withMessage('Invalid document ID'),
  body('category')
    .optional()
    .isIn(VAULT_DOCUMENT_CATEGORIES).withMessage('Invalid document category'),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 500 }),
  body('tags')
    .optional()
    .isArray(),
  body('tags.*')
    .optional()
    .isString()
    .isLength({ max: 50 }),
];

export const getDocumentValidation = [
  param('id').isMongoId().withMessage('Invalid document ID'),
];

export const deleteDocumentValidation = [
  param('id').isMongoId().withMessage('Invalid document ID'),
];

export const listDocumentsValidation = [
  query('financialYear')
    .optional()
    .matches(fyRegex).withMessage('financialYear must be YYYY-YY format'),
  query('category')
    .optional()
    .isIn(VAULT_DOCUMENT_CATEGORIES),
  query('page')
    .optional()
    .isInt({ min: 1 }).toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).toInt(),
];

export const listYearsValidation: never[] = [];

export const storageUsageValidation: never[] = [];

export const prefillValidation = [
  param('financialYear')
    .matches(fyRegex).withMessage('financialYear must be YYYY-YY format'),
];

// ─── Tax Year Summary Validators ────────────────────────────────────────────

export const createTaxSummaryValidation = [
  body('userId').isMongoId().withMessage('Invalid userId'),
  body('financialYear')
    .isString()
    .matches(fyRegex).withMessage('financialYear must be YYYY-YY format'),
  body('orderId').optional().isMongoId(),
  body('totalIncome').isInt({ min: 0 }).withMessage('totalIncome must be non-negative integer (cents)'),
  body('totalDeductions').isInt({ min: 0 }).withMessage('totalDeductions must be non-negative integer (cents)'),
  body('taxableIncome').isInt({ min: 0 }).withMessage('taxableIncome must be non-negative integer (cents)'),
  body('medicareLevyAmount').isInt({ min: 0 }),
  body('hecsRepayment').isInt({ min: 0 }),
  body('totalTaxPayable').isInt({ min: 0 }),
  body('taxWithheld').isInt({ min: 0 }),
  body('refundOrOwing').isInt().withMessage('refundOrOwing must be integer (cents)'),
  body('superannuationReported').optional().isInt({ min: 0 }),
  body('filingDate').optional().isISO8601(),
  body('assessmentDate').optional().isISO8601(),
  body('noaReceived').optional().isBoolean(),
  body('atoRefundStatus').optional().isIn(ATO_REFUND_STATUSES),
  body('servicesUsed').optional().isArray(),
  body('totalPaidToQegos').optional().isInt({ min: 0 }),
];

export const listTaxSummariesValidation: never[] = [];

export const yoyComparisonValidation = [
  param('year')
    .matches(fyRegex).withMessage('year must be YYYY-YY format'),
];

// ─── ATO Status Validators ──────────────────────────────────────────────────

export const getAtoStatusValidation = [
  param('year')
    .matches(fyRegex).withMessage('year must be YYYY-YY format'),
];

export const updateAtoStatusValidation = [
  param('year')
    .matches(fyRegex).withMessage('year must be YYYY-YY format'),
  body('userId').isMongoId().withMessage('Invalid userId'),
  body('atoRefundStatus')
    .isIn(ATO_REFUND_STATUSES).withMessage('Invalid ATO refund status'),
  body('assessmentDate').optional().isISO8601(),
  body('noaReceived').optional().isBoolean(),
  body('atoRefundIssuedDate').optional().isISO8601(),
];

export const bulkUpdateAtoStatusValidation = [
  body('updates')
    .isArray({ min: 1 }).withMessage('updates must be a non-empty array'),
  body('updates.*.userId').isMongoId(),
  body('updates.*.financialYear')
    .matches(fyRegex).withMessage('financialYear must be YYYY-YY format'),
  body('updates.*.atoRefundStatus')
    .isIn(ATO_REFUND_STATUSES),
  body('updates.*.assessmentDate').optional().isISO8601(),
  body('updates.*.noaReceived').optional().isBoolean(),
  body('updates.*.atoRefundIssuedDate').optional().isISO8601(),
];
