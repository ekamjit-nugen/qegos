import { body, param, query } from 'express-validator';
import type { ValidationChain } from 'express-validator';
import {
  E_FILE_STATUSES,
  APPOINTMENT_TYPES,
  ORDER_TYPES,
  SALES_CATEGORIES,
} from './order.types';

export function createOrderValidation(): ValidationChain[] {
  return [
    body('financialYear')
      .trim().notEmpty().withMessage('Financial year is required'),
    body('personalDetails')
      .isObject().withMessage('Personal details are required'),
    body('personalDetails.firstName')
      .trim().notEmpty().withMessage('First name is required'),
    body('personalDetails.lastName')
      .trim().notEmpty().withMessage('Last name is required'),
    body('lineItems')
      .optional()
      .isArray().withMessage('Line items must be an array'),
    body('lineItems.*.salesId')
      .optional()
      .isMongoId().withMessage('Each salesId must be a valid ID'),
    body('lineItems.*.quantity')
      .optional()
      .isInt({ min: 1 }).withMessage('Quantity must be at least 1')
      .toInt(),
    body('discountPercent')
      .optional()
      .isFloat({ min: 0, max: 100 }).withMessage('Discount must be 0-100'),
    body('orderType')
      .optional()
      .isIn([...ORDER_TYPES]).withMessage('Invalid order type'),
  ];
}

export function updateOrderValidation(): ValidationChain[] {
  return [
    param('id').isMongoId().withMessage('Invalid order ID'),
    body('financialYear')
      .optional()
      .trim().notEmpty().withMessage('Financial year cannot be empty'),
    body('discountPercent')
      .optional()
      .isFloat({ min: 0, max: 100 }).withMessage('Discount must be 0-100'),
  ];
}

export function statusTransitionValidation(): ValidationChain[] {
  return [
    param('id').isMongoId().withMessage('Invalid order ID'),
    body('status')
      .notEmpty().withMessage('Status is required')
      .isInt({ min: 1, max: 9 }).withMessage('Status must be 1-9')
      .toInt(),
    body('note').optional().trim(),
    body('eFileReference').optional().trim(),
    body('cancelReason').optional().trim(),
  ];
}

export function assignOrderValidation(): ValidationChain[] {
  return [
    param('id').isMongoId().withMessage('Invalid order ID'),
    body('processingBy')
      .trim().notEmpty().withMessage('Staff ID is required')
      .isMongoId().withMessage('Invalid staff ID'),
  ];
}

export function bulkAssignValidation(): ValidationChain[] {
  return [
    body('orderIds')
      .isArray({ min: 1 }).withMessage('At least one order ID is required'),
    body('orderIds.*')
      .isMongoId().withMessage('Each order ID must be a valid ID'),
    body('processingBy')
      .trim().notEmpty().withMessage('Staff ID is required')
      .isMongoId().withMessage('Invalid staff ID'),
  ];
}

export function scheduleAppointmentValidation(): ValidationChain[] {
  return [
    param('id').isMongoId().withMessage('Invalid order ID'),
    body('date')
      .notEmpty().withMessage('Date is required')
      .isISO8601().withMessage('Must be a valid date'),
    body('timeSlot')
      .trim().notEmpty().withMessage('Time slot is required'),
    body('type')
      .trim().notEmpty().withMessage('Appointment type is required')
      .isIn([...APPOINTMENT_TYPES]).withMessage('Invalid appointment type'),
    body('staffId')
      .trim().notEmpty().withMessage('Staff ID is required')
      .isMongoId().withMessage('Invalid staff ID'),
  ];
}

export function progressValidation(): ValidationChain[] {
  return [
    param('id').isMongoId().withMessage('Invalid order ID'),
    body('percent')
      .notEmpty().withMessage('Percent is required')
      .isInt({ min: 0, max: 100 }).withMessage('Percent must be 0-100')
      .toInt(),
  ];
}

export function listOrderValidation(): ValidationChain[] {
  return [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1').toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100').toInt(),
    query('status').optional().isInt({ min: 1, max: 9 }).withMessage('Status must be 1-9').toInt(),
    query('financialYear').optional().trim(),
    query('processingBy').optional().isMongoId().withMessage('Invalid staff ID'),
    query('userId').optional().isMongoId().withMessage('Invalid user ID'),
    query('eFileStatus').optional().isIn([...E_FILE_STATUSES]).withMessage('Invalid e-file status'),
  ];
}

// ─── Sales Validators ───────────────────────────────────────────────────────

export function createSalesValidation(): ValidationChain[] {
  return [
    body('title')
      .trim().notEmpty().withMessage('Title is required'),
    body('price')
      .notEmpty().withMessage('Price is required')
      .isInt({ min: 0 }).withMessage('Price must be a non-negative integer (cents)')
      .toInt(),
    body('category')
      .trim().notEmpty().withMessage('Category is required')
      .isIn([...SALES_CATEGORIES]).withMessage('Invalid category'),
    body('gstInclusive')
      .optional()
      .isBoolean().withMessage('gstInclusive must be boolean'),
    body('inputBased')
      .optional()
      .isBoolean().withMessage('inputBased must be boolean'),
    body('sortOrder')
      .optional()
      .isInt({ min: 0 }).withMessage('Sort order must be non-negative')
      .toInt(),
  ];
}

export function updateSalesValidation(): ValidationChain[] {
  return [
    param('id').isMongoId().withMessage('Invalid sales ID'),
    body('title')
      .optional()
      .trim().notEmpty().withMessage('Title cannot be empty'),
    body('price')
      .optional()
      .isInt({ min: 0 }).withMessage('Price must be a non-negative integer (cents)')
      .toInt(),
    body('category')
      .optional()
      .isIn([...SALES_CATEGORIES]).withMessage('Invalid category'),
  ];
}
