import { body, param, query } from 'express-validator';
import type { ValidationChain } from 'express-validator';
import { DEADLINE_TYPES, APPLICABLE_TO_VALUES } from './taxCalendar.types';

export function validateCreateDeadline(): ValidationChain[] {
  return [
    body('title')
      .trim()
      .notEmpty()
      .withMessage('Title is required')
      .isLength({ max: 200 })
      .withMessage('Title must be at most 200 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description must be at most 1000 characters'),
    body('deadlineDate')
      .notEmpty()
      .withMessage('Deadline date is required')
      .isISO8601()
      .withMessage('Deadline date must be a valid ISO 8601 date'),
    body('type')
      .trim()
      .notEmpty()
      .withMessage('Type is required')
      .isIn(DEADLINE_TYPES)
      .withMessage('Invalid deadline type'),
    body('applicableTo')
      .optional()
      .isIn(APPLICABLE_TO_VALUES)
      .withMessage('Invalid applicableTo value'),
    body('reminderSchedule').optional().isArray().withMessage('Reminder schedule must be an array'),
    body('reminderSchedule.*.daysBefore')
      .optional()
      .isInt({ min: 1 })
      .withMessage('daysBefore must be a positive integer'),
    body('reminderSchedule.*.channel')
      .optional()
      .isIn(['email', 'push', 'sms', 'sms_push'])
      .withMessage('Invalid reminder channel'),
    body('financialYear')
      .trim()
      .notEmpty()
      .withMessage('Financial year is required')
      .matches(/^\d{4}-\d{4}$/)
      .withMessage('Financial year must be in YYYY-YYYY format'),
    body('isRecurring').optional().isBoolean().withMessage('isRecurring must be a boolean'),
  ];
}

export function validateUpdateDeadline(): ValidationChain[] {
  return [
    param('id').trim().notEmpty().isMongoId().withMessage('Deadline ID must be a valid ID'),
    body('title')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Title must be at most 200 characters'),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('deadlineDate')
      .optional()
      .isISO8601()
      .withMessage('Deadline date must be a valid ISO 8601 date'),
    body('type').optional().isIn(DEADLINE_TYPES).withMessage('Invalid deadline type'),
    body('applicableTo')
      .optional()
      .isIn(APPLICABLE_TO_VALUES)
      .withMessage('Invalid applicableTo value'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
    body('isRecurring').optional().isBoolean().withMessage('isRecurring must be a boolean'),
  ];
}

export function validateDeadlineId(): ValidationChain[] {
  return [param('id').trim().notEmpty().isMongoId().withMessage('Deadline ID must be a valid ID')];
}

export function validateListParams(): ValidationChain[] {
  return [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('financialYear')
      .optional()
      .matches(/^\d{4}-\d{4}$/),
    query('type').optional().isIn(DEADLINE_TYPES),
    query('applicableTo').optional().isIn(APPLICABLE_TO_VALUES),
    query('isActive').optional().isBoolean(),
  ];
}
