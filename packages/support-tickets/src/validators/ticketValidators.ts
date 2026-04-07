import { body, param, query } from 'express-validator';
import {
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  TICKET_CATEGORIES,
  TICKET_SOURCES,
  RESOLUTION_CATEGORIES,
} from '../types';

export const createTicketValidation = [
  body('category')
    .isIn(TICKET_CATEGORIES).withMessage('Invalid ticket category'),
  body('priority')
    .optional()
    .isIn(TICKET_PRIORITIES).withMessage('Invalid priority'),
  body('subject')
    .isString().isLength({ min: 1, max: 200 }).withMessage('Subject required, max 200 chars'),
  body('description')
    .isString().isLength({ min: 1 }).withMessage('Description is required'),
  body('orderId')
    .optional()
    .isMongoId(),
  body('source')
    .optional()
    .isIn(TICKET_SOURCES),
];

export const listTicketsValidation = [
  query('status').optional().isIn(TICKET_STATUSES),
  query('category').optional().isIn(TICKET_CATEGORIES),
  query('priority').optional().isIn(TICKET_PRIORITIES),
  query('assignedTo').optional().isMongoId(),
  query('slaBreached').optional().isBoolean().toBoolean(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

export const getTicketValidation = [
  param('id').isMongoId().withMessage('Invalid ticket ID'),
];

export const updateStatusValidation = [
  param('id').isMongoId(),
  body('status')
    .isIn(TICKET_STATUSES).withMessage('Invalid status'),
];

export const assignTicketValidation = [
  param('id').isMongoId(),
  body('staffId').isMongoId().withMessage('Invalid staff ID'),
];

export const addMessageValidation = [
  param('id').isMongoId(),
  body('content').isString().isLength({ min: 1 }).withMessage('Message content is required'),
  body('isInternal').optional().isBoolean(),
  body('attachments').optional().isArray(),
  body('attachments.*').optional().isString(),
];

export const escalateValidation = [
  param('id').isMongoId(),
  body('escalatedTo').isMongoId().withMessage('Escalation target required'),
  body('reason').isString().isLength({ min: 1 }).withMessage('Escalation reason required'),
];

export const resolveValidation = [
  param('id').isMongoId(),
  body('resolution').isString().isLength({ min: 1 }).withMessage('Resolution is required'),
  body('resolutionCategory')
    .isIn(RESOLUTION_CATEGORIES).withMessage('Invalid resolution category'),
];

export const reopenValidation = [
  param('id').isMongoId(),
];

export const satisfactionValidation = [
  param('id').isMongoId(),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
];
