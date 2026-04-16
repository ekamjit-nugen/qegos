import { body, param } from 'express-validator';

/**
 * POST /documents/upload — Upload document to order
 */
export const uploadDocumentValidation = [
  body('orderId').isMongoId().withMessage('orderId must be a valid ObjectId'),
  body('documentType')
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage('documentType must be a non-empty string'),
];

/**
 * POST /documents/upload-proof — Upload ID verification document
 */
export const uploadProofValidation = [
  body('orderId').isMongoId().withMessage('orderId must be a valid ObjectId'),
];

/**
 * POST /documents/create — Create Zoho Sign signing request
 */
export const createSigningValidation = [
  body('orderId').isMongoId().withMessage('orderId must be a valid ObjectId'),
  body('documentIndex')
    .isInt({ min: 0 })
    .withMessage('documentIndex must be a non-negative integer'),
  body('clientName').isString().trim().notEmpty().withMessage('clientName is required'),
  body('clientEmail').isEmail().withMessage('clientEmail must be a valid email'),
  body('adminName').isString().trim().notEmpty().withMessage('adminName is required'),
  body('adminEmail').isEmail().withMessage('adminEmail must be a valid email'),
];

/**
 * POST /documents/send-for-sign — Send signing request for signatures
 */
export const sendForSignValidation = [
  body('orderId').isMongoId().withMessage('orderId must be a valid ObjectId'),
  body('zohoRequestId').isString().trim().notEmpty().withMessage('zohoRequestId is required'),
];

/**
 * POST /documents/generate-uri — Generate embedded signing URL
 */
export const generateUriValidation = [
  body('orderId').isMongoId().withMessage('orderId must be a valid ObjectId'),
  body('zohoRequestId').isString().trim().notEmpty().withMessage('zohoRequestId is required'),
  body('actionId').isString().trim().notEmpty().withMessage('actionId is required'),
];

/**
 * GET /documents/order/:orderId — List order documents
 */
export const listOrderDocumentsValidation = [
  param('orderId').isMongoId().withMessage('orderId must be a valid ObjectId'),
];

export const signingStatusValidation = [
  param('orderId').isMongoId().withMessage('orderId must be a valid ObjectId'),
  param('documentIndex')
    .isInt({ min: 0 })
    .withMessage('documentIndex must be a non-negative integer'),
];
