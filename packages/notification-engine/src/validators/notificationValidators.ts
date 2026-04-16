import { body, param, query } from 'express-validator';
import type { ValidationChain } from 'express-validator';
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
  RECIPIENT_TYPES,
  PREFERENCE_LANGUAGES,
} from '../types';

export function validateListNotifications(): ValidationChain[] {
  return [
    query('isRead').optional().isBoolean().toBoolean(),
    query('type').optional().isIn(NOTIFICATION_TYPES).withMessage('Invalid notification type'),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ];
}

export function validateMarkRead(): ValidationChain[] {
  return [
    param('id').trim().notEmpty().isMongoId().withMessage('Notification ID must be a valid ID'),
  ];
}

export function validateUpdatePreferences(): ValidationChain[] {
  return [
    body('preferences').optional().isObject().withMessage('Preferences must be an object'),
    body('quietHoursEnabled')
      .optional()
      .isBoolean()
      .withMessage('quietHoursEnabled must be a boolean'),
    body('quietHoursStart')
      .optional()
      .matches(/^\d{2}:\d{2}$/)
      .withMessage('quietHoursStart must be HH:mm format'),
    body('quietHoursEnd')
      .optional()
      .matches(/^\d{2}:\d{2}$/)
      .withMessage('quietHoursEnd must be HH:mm format'),
    body('timezone')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Invalid timezone'),
    body('language').optional().isIn(PREFERENCE_LANGUAGES).withMessage('Invalid language'),
  ];
}

export function validateSendNotification(): ValidationChain[] {
  return [
    body('recipientId')
      .trim()
      .notEmpty()
      .withMessage('Recipient ID is required')
      .isMongoId()
      .withMessage('Recipient ID must be a valid ID'),
    body('recipientType')
      .trim()
      .notEmpty()
      .withMessage('Recipient type is required')
      .isIn(RECIPIENT_TYPES)
      .withMessage('Invalid recipient type'),
    body('type')
      .trim()
      .notEmpty()
      .withMessage('Notification type is required')
      .isIn(NOTIFICATION_TYPES)
      .withMessage('Invalid notification type'),
    body('title')
      .trim()
      .notEmpty()
      .withMessage('Title is required')
      .isLength({ max: 200 })
      .withMessage('Title must not exceed 200 characters'),
    body('body')
      .trim()
      .notEmpty()
      .withMessage('Body is required')
      .isLength({ max: 2000 })
      .withMessage('Body must not exceed 2000 characters'),
    body('channels').isArray({ min: 1 }).withMessage('At least one channel is required'),
    body('channels.*').isIn(NOTIFICATION_CHANNELS).withMessage('Invalid notification channel'),
  ];
}
