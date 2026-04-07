import { body, param, query } from 'express-validator';
import { CANNED_RESPONSE_CATEGORIES } from '../types';

export const createConversationValidation = [
  body('staffId').optional().isMongoId(),
  body('orderId').optional().isMongoId(),
  body('subject').optional().isString().isLength({ max: 200 }),
];

export const getConversationValidation = [
  param('id').isMongoId().withMessage('Invalid conversation ID'),
];

export const listConversationsValidation = [
  query('status').optional().isIn(['active', 'resolved', 'archived']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

export const sendMessageValidation = [
  body('conversationId').isMongoId().withMessage('Invalid conversation ID'),
  body('content').isString().isLength({ min: 1 }).withMessage('Message content is required'),
  body('type').optional().isIn(['text', 'file', 'canned_response']),
  body('fileUrl').optional().isString(),
  body('fileName').optional().isString(),
  body('fileSize').optional().isInt({ min: 0 }),
  body('mimeType').optional().isString(),
];

export const markReadValidation = [
  param('id').isMongoId().withMessage('Invalid message ID'),
];

export const resolveConversationValidation = [
  param('id').isMongoId().withMessage('Invalid conversation ID'),
];

export const transferConversationValidation = [
  param('id').isMongoId().withMessage('Invalid conversation ID'),
  body('newStaffId').isMongoId().withMessage('Invalid staff ID'),
  body('newStaffName').isString().isLength({ min: 1 }).withMessage('Staff name required'),
];

export const createCannedResponseValidation = [
  body('title').isString().isLength({ min: 1, max: 100 }),
  body('content').isString().isLength({ min: 1 }),
  body('category').isIn(CANNED_RESPONSE_CATEGORIES),
  body('isGlobal').optional().isBoolean(),
];

export const searchMessagesValidation = [
  body('query').isString().isLength({ min: 1 }).withMessage('Search query is required'),
  body('page').optional().isInt({ min: 1 }),
  body('limit').optional().isInt({ min: 1, max: 100 }),
];
