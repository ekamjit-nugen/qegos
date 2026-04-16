import { body, param } from 'express-validator';
import type { ValidationChain } from 'express-validator';

export function submitForReviewValidation(): ValidationChain[] {
  return [
    body('orderId')
      .trim()
      .notEmpty()
      .withMessage('Order ID is required')
      .isMongoId()
      .withMessage('Invalid order ID'),
  ];
}

export function startReviewValidation(): ValidationChain[] {
  return [param('orderId').isMongoId().withMessage('Invalid order ID')];
}

export function approveReviewValidation(): ValidationChain[] {
  return [param('orderId').isMongoId().withMessage('Invalid order ID')];
}

export function requestChangesValidation(): ValidationChain[] {
  return [
    param('orderId').isMongoId().withMessage('Invalid order ID'),
    body('changesRequested')
      .isArray({ min: 1 })
      .withMessage('At least one change request is required'),
    body('changesRequested.*.field')
      .trim()
      .notEmpty()
      .withMessage('Field is required for each change'),
    body('changesRequested.*.issue')
      .trim()
      .notEmpty()
      .withMessage('Issue is required for each change'),
    body('changesRequested.*.instruction')
      .trim()
      .notEmpty()
      .withMessage('Instruction is required for each change'),
    body('reviewNotes').optional().trim(),
  ];
}

export function rejectReviewValidation(): ValidationChain[] {
  return [
    param('orderId').isMongoId().withMessage('Invalid order ID'),
    body('rejectedReason').trim().notEmpty().withMessage('Rejection reason is required'),
  ];
}

export function resolveChangeValidation(): ValidationChain[] {
  return [
    param('orderId').isMongoId().withMessage('Invalid order ID'),
    body('changeIndex')
      .notEmpty()
      .withMessage('Change index is required')
      .isInt({ min: 0 })
      .withMessage('Change index must be a non-negative integer')
      .toInt(),
  ];
}

// Fix for B-3.14, G-3.4: Checklist update validation
export function updateChecklistValidation(): ValidationChain[] {
  return [
    param('orderId').isMongoId().withMessage('Invalid order ID'),
    body('index')
      .notEmpty()
      .withMessage('Checklist item index is required')
      .isInt({ min: 0 })
      .withMessage('Index must be a non-negative integer')
      .toInt(),
    body('checked')
      .notEmpty()
      .withMessage('Checked value is required')
      .isBoolean()
      .withMessage('Checked must be a boolean'),
    body('note')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Note must be at most 1000 characters'),
  ];
}
