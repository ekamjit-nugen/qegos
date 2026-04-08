import { body, param, query } from 'express-validator';
import type { ValidationChain } from 'express-validator';

export function validateErasureRequest(): ValidationChain[] {
  return [
    body('userId')
      .trim().notEmpty().withMessage('User ID is required')
      .isMongoId().withMessage('User ID must be a valid ID'),
    body('reason')
      .optional().trim().isLength({ max: 2000 })
      .withMessage('Reason must be at most 2000 characters'),
  ];
}

export function validateErasureApproval(): ValidationChain[] {
  return [
    param('id')
      .trim().notEmpty().isMongoId().withMessage('Request ID must be a valid ID'),
  ];
}

export function validateErasureRejection(): ValidationChain[] {
  return [
    param('id')
      .trim().notEmpty().isMongoId().withMessage('Request ID must be a valid ID'),
    body('rejectionReason')
      .trim().notEmpty().withMessage('Rejection reason is required')
      .isLength({ max: 2000 }).withMessage('Rejection reason must be at most 2000 characters'),
  ];
}

export function validateExportRequest(): ValidationChain[] {
  return [
    body('format')
      .optional().isIn(['json', 'csv']).withMessage('Format must be json or csv'),
  ];
}

export function validateListErasureRequests(): ValidationChain[] {
  return [
    query('status')
      .optional()
      .isIn(['pending', 'approved', 'in_progress', 'completed', 'failed', 'rejected'])
      .withMessage('Invalid status'),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ];
}

export function validateExportId(): ValidationChain[] {
  return [
    param('id')
      .trim().notEmpty().isMongoId().withMessage('Export ID must be a valid ID'),
  ];
}
