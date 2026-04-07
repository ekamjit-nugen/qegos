import { body, param, query } from 'express-validator';
import type { ValidationChain } from 'express-validator';
import {
  LEAD_SOURCES,
  LEAD_PRIORITIES,
  PREFERRED_LANGUAGES,
  PREFERRED_CONTACTS,
  AU_STATES,
  MARITAL_STATUSES,
  EMPLOYMENT_TYPES,
  LOST_REASONS,
  ACTIVITY_TYPES,
  ACTIVITY_OUTCOMES,
  SENTIMENTS,
  CALL_DIRECTIONS,
} from './lead.types';

// ─── Lead Validators ────────────────────────────────────────────────────────

export function createLeadValidation(): ValidationChain[] {
  return [
    body('source')
      .trim().notEmpty().withMessage('Source is required')
      .isIn([...LEAD_SOURCES]).withMessage('Invalid lead source'),
    body('firstName')
      .trim().notEmpty().withMessage('First name is required'),
    body('mobile')
      .trim().notEmpty().withMessage('Mobile is required'),
    body('email')
      .optional({ values: 'null' })
      .trim().isEmail().withMessage('Must be a valid email'),
    body('preferredLanguage')
      .optional({ values: 'null' })
      .isIn([...PREFERRED_LANGUAGES]).withMessage('Invalid language'),
    body('preferredContact')
      .optional({ values: 'null' })
      .isIn([...PREFERRED_CONTACTS]).withMessage('Invalid contact preference'),
    body('state')
      .optional({ values: 'null' })
      .isIn([...AU_STATES]).withMessage('Invalid Australian state'),
    body('postcode')
      .optional({ values: 'null' })
      .matches(/^\d{4}$/).withMessage('Must be a 4-digit postcode'),
    body('estimatedValue')
      .optional({ values: 'null' })
      .isInt({ min: 0 }).withMessage('estimatedValue must be a non-negative integer (cents)')
      .toInt(),
    body('maritalStatus')
      .optional({ values: 'null' })
      .isIn([...MARITAL_STATUSES]).withMessage('Invalid marital status'),
    body('employmentType')
      .optional({ values: 'null' })
      .isIn([...EMPLOYMENT_TYPES]).withMessage('Invalid employment type'),
    body('priority')
      .optional({ values: 'null' })
      .isIn([...LEAD_PRIORITIES]).withMessage('Invalid priority'),
  ];
}

export function updateLeadValidation(): ValidationChain[] {
  return [
    param('id').isMongoId().withMessage('Invalid lead ID'),
    body('source')
      .optional()
      .isIn([...LEAD_SOURCES]).withMessage('Invalid lead source'),
    body('firstName')
      .optional()
      .trim().notEmpty().withMessage('First name cannot be empty'),
    body('email')
      .optional({ values: 'null' })
      .trim().isEmail().withMessage('Must be a valid email'),
    body('state')
      .optional({ values: 'null' })
      .isIn([...AU_STATES]).withMessage('Invalid Australian state'),
    body('estimatedValue')
      .optional({ values: 'null' })
      .isInt({ min: 0 }).withMessage('estimatedValue must be a non-negative integer (cents)')
      .toInt(),
    body('maritalStatus')
      .optional({ values: 'null' })
      .isIn([...MARITAL_STATUSES]).withMessage('Invalid marital status'),
    body('employmentType')
      .optional({ values: 'null' })
      .isIn([...EMPLOYMENT_TYPES]).withMessage('Invalid employment type'),
  ];
}

export function statusTransitionValidation(): ValidationChain[] {
  return [
    param('id').isMongoId().withMessage('Invalid lead ID'),
    body('status')
      .notEmpty().withMessage('Status is required')
      .isInt({ min: 1, max: 8 }).withMessage('Status must be 1-8')
      .toInt(),
    body('lostReason')
      .optional()
      .isIn([...LOST_REASONS]).withMessage('Invalid lost reason'),
    body('lostReasonNote')
      .optional()
      .trim(),
  ];
}

export function assignLeadValidation(): ValidationChain[] {
  return [
    param('id').isMongoId().withMessage('Invalid lead ID'),
    body('assignedTo')
      .trim().notEmpty().withMessage('Staff ID is required')
      .isMongoId().withMessage('Invalid staff ID'),
  ];
}

export function bulkAssignValidation(): ValidationChain[] {
  return [
    body('leadIds')
      .isArray({ min: 1 }).withMessage('At least one lead ID is required'),
    body('leadIds.*')
      .isMongoId().withMessage('Each lead ID must be a valid ID'),
    body('assignedTo')
      .trim().notEmpty().withMessage('Staff ID is required')
      .isMongoId().withMessage('Invalid staff ID'),
  ];
}

export function bulkStatusValidation(): ValidationChain[] {
  return [
    body('leadIds')
      .isArray({ min: 1 }).withMessage('At least one lead ID is required'),
    body('leadIds.*')
      .isMongoId().withMessage('Each lead ID must be a valid ID'),
    body('status')
      .notEmpty().withMessage('Status is required')
      .isInt({ min: 1, max: 8 }).withMessage('Status must be 1-8')
      .toInt(),
    body('lostReason')
      .optional()
      .isIn([...LOST_REASONS]).withMessage('Invalid lost reason'),
  ];
}

export function mergeLeadValidation(): ValidationChain[] {
  return [
    body('primaryLeadId')
      .trim().notEmpty().withMessage('Primary lead ID is required')
      .isMongoId().withMessage('Invalid primary lead ID'),
    body('secondaryLeadId')
      .trim().notEmpty().withMessage('Secondary lead ID is required')
      .isMongoId().withMessage('Invalid secondary lead ID'),
    body('fieldSelections')
      .isObject().withMessage('Field selections must be an object'),
  ];
}

export function checkDuplicateValidation(): ValidationChain[] {
  return [
    body('mobile')
      .optional()
      .trim(),
    body('email')
      .optional()
      .trim().isEmail().withMessage('Must be a valid email'),
  ];
}

export function convertLeadValidation(): ValidationChain[] {
  return [
    param('id').isMongoId().withMessage('Invalid lead ID'),
  ];
}

export function convertExistingValidation(): ValidationChain[] {
  return [
    param('id').isMongoId().withMessage('Invalid lead ID'),
    body('userId')
      .trim().notEmpty().withMessage('User ID is required')
      .isMongoId().withMessage('Invalid user ID'),
  ];
}

// ─── Activity Validators ────────────────────────────────────────────────────

export function logActivityValidation(): ValidationChain[] {
  return [
    body('leadId')
      .trim().notEmpty().withMessage('Lead ID is required')
      .isMongoId().withMessage('Invalid lead ID'),
    body('type')
      .trim().notEmpty().withMessage('Activity type is required')
      .isIn([...ACTIVITY_TYPES]).withMessage('Invalid activity type'),
    body('description')
      .trim().notEmpty().withMessage('Description is required'),
    body('outcome')
      .optional()
      .isIn([...ACTIVITY_OUTCOMES]).withMessage('Invalid outcome'),
    body('sentiment')
      .optional()
      .isIn([...SENTIMENTS]).withMessage('Invalid sentiment'),
    body('callDuration')
      .optional()
      .isInt({ min: 0 }).withMessage('Call duration must be a non-negative integer')
      .toInt(),
    body('callDirection')
      .optional()
      .isIn([...CALL_DIRECTIONS]).withMessage('Invalid call direction'),
    body('quotedAmount')
      .optional()
      .isInt({ min: 0 }).withMessage('Quoted amount must be a non-negative integer (cents)')
      .toInt(),
  ];
}

export function updateActivityValidation(): ValidationChain[] {
  return [
    param('id').isMongoId().withMessage('Invalid activity ID'),
    body('description')
      .optional()
      .trim().notEmpty().withMessage('Description cannot be empty'),
    body('outcome')
      .optional()
      .isIn([...ACTIVITY_OUTCOMES]).withMessage('Invalid outcome'),
    body('sentiment')
      .optional()
      .isIn([...SENTIMENTS]).withMessage('Invalid sentiment'),
  ];
}

export function logCallValidation(): ValidationChain[] {
  return [
    body('leadId')
      .trim().notEmpty().withMessage('Lead ID is required')
      .isMongoId().withMessage('Invalid lead ID'),
    body('callDuration')
      .notEmpty().withMessage('Call duration is required')
      .isInt({ min: 0 }).withMessage('Call duration must be a non-negative integer')
      .toInt(),
    body('callDirection')
      .trim().notEmpty().withMessage('Call direction is required')
      .isIn([...CALL_DIRECTIONS]).withMessage('Invalid call direction'),
    body('description')
      .trim().notEmpty().withMessage('Description is required'),
    body('outcome')
      .optional()
      .isIn([...ACTIVITY_OUTCOMES]).withMessage('Invalid outcome'),
  ];
}

// ─── Reminder Validators ────────────────────────────────────────────────────

export function createReminderValidation(): ValidationChain[] {
  return [
    body('leadId')
      .trim().notEmpty().withMessage('Lead ID is required')
      .isMongoId().withMessage('Invalid lead ID'),
    body('assignedTo')
      .trim().notEmpty().withMessage('Assigned to is required')
      .isMongoId().withMessage('Invalid user ID'),
    body('reminderDate')
      .notEmpty().withMessage('Reminder date is required')
      .isISO8601().withMessage('Must be a valid date'),
    body('reminderTime')
      .trim().notEmpty().withMessage('Reminder time is required')
      .matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('Must be in HH:mm format'),
    body('title')
      .trim().notEmpty().withMessage('Title is required'),
  ];
}

export function snoozeReminderValidation(): ValidationChain[] {
  return [
    param('id').isMongoId().withMessage('Invalid reminder ID'),
    body('newDate')
      .notEmpty().withMessage('New date is required')
      .isISO8601().withMessage('Must be a valid date'),
    body('newTime')
      .trim().notEmpty().withMessage('New time is required')
      .matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('Must be in HH:mm format'),
  ];
}

// ─── List/Search Validators ─────────────────────────────────────────────────

export function listLeadValidation(): ValidationChain[] {
  return [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1').toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100').toInt(),
    query('status').optional().isInt({ min: 1, max: 8 }).withMessage('Status must be 1-8').toInt(),
    query('priority').optional().isIn([...LEAD_PRIORITIES]).withMessage('Invalid priority'),
    query('source').optional().isIn([...LEAD_SOURCES]).withMessage('Invalid source'),
    query('assignedTo').optional().isMongoId().withMessage('Invalid staff ID'),
    query('state').optional().isIn([...AU_STATES]).withMessage('Invalid state'),
  ];
}

export function searchLeadValidation(): ValidationChain[] {
  return [
    body('query')
      .trim().notEmpty().withMessage('Search query is required')
      .isLength({ min: 2 }).withMessage('Search query must be at least 2 characters'),
  ];
}
