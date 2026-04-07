import { body, param, query } from 'express-validator';

export const sendTemplateValidation = [
  body('contactId').isMongoId().withMessage('Invalid contact ID'),
  body('contactType').isIn(['lead', 'user']).withMessage('contactType must be lead or user'),
  body('contactMobile').matches(/^\+61\d{9}$/).withMessage('Must be E.164 Australian format'),
  body('templateName').isString().isLength({ min: 1 }).withMessage('Template name required'),
  body('params').optional().isArray(),
  body('params.*').optional().isString(),
];

export const sendFreeformValidation = [
  body('contactId').isMongoId().withMessage('Invalid contact ID'),
  body('contactType').isIn(['lead', 'user']).withMessage('contactType must be lead or user'),
  body('contactMobile').matches(/^\+61\d{9}$/).withMessage('Must be E.164 Australian format'),
  body('content').isString().isLength({ min: 1 }).withMessage('Message content required'),
];

export const updateConfigValidation = [
  body('phoneNumberId').optional().isString(),
  body('accessToken').optional().isString(),
  body('webhookVerifyToken').optional().isString(),
  body('metaBusinessAccountId').optional().isString(),
];

export const getConversationValidation = [
  param('contactId').isMongoId().withMessage('Invalid contact ID'),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

export const getMediaValidation = [
  param('messageId').isMongoId().withMessage('Invalid message ID'),
];
