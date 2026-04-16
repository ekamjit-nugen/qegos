import { body, param, query } from 'express-validator';
import { APPOINTMENT_TYPES, APPOINTMENT_STATUSES, timeToMinutes } from './appointment.types';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Create appointment validation.
 */
export function createAppointmentValidation(): ReturnType<typeof body>[] {
  return [
    body('userId')
      .notEmpty()
      .withMessage('userId is required')
      .isMongoId()
      .withMessage('userId must be a valid ObjectId'),
    body('staffId')
      .notEmpty()
      .withMessage('staffId is required')
      .isMongoId()
      .withMessage('staffId must be a valid ObjectId'),
    body('date')
      .notEmpty()
      .withMessage('date is required')
      .isISO8601()
      .withMessage('date must be a valid ISO 8601 date'),
    body('startTime')
      .notEmpty()
      .withMessage('startTime is required')
      .matches(TIME_PATTERN)
      .withMessage('startTime must be HH:mm format'),
    body('endTime')
      .notEmpty()
      .withMessage('endTime is required')
      .matches(TIME_PATTERN)
      .withMessage('endTime must be HH:mm format')
      .custom((endTime: string, { req }) => {
        const startTime = (req as { body?: { startTime?: string } }).body?.startTime;
        if (startTime && TIME_PATTERN.test(startTime) && TIME_PATTERN.test(endTime)) {
          if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
            throw new Error('endTime must be after startTime');
          }
        }
        return true;
      }),
    body('type')
      .notEmpty()
      .withMessage('Appointment type is required')
      .isIn([...APPOINTMENT_TYPES])
      .withMessage(`type must be one of: ${APPOINTMENT_TYPES.join(', ')}`),
    body('orderId').optional().isMongoId().withMessage('orderId must be a valid ObjectId'),
    body('meetingLink').optional().isURL().withMessage('meetingLink must be a valid URL'),
    body('notes').optional().trim(),
  ];
}

/**
 * Update appointment validation.
 */
export function updateAppointmentValidation(): Array<
  ReturnType<typeof body> | ReturnType<typeof param>
> {
  return [
    param('id').isMongoId().withMessage('Invalid appointment ID'),
    body('date').optional().isISO8601().withMessage('date must be a valid ISO 8601 date'),
    body('startTime')
      .optional()
      .matches(TIME_PATTERN)
      .withMessage('startTime must be HH:mm format'),
    body('endTime').optional().matches(TIME_PATTERN).withMessage('endTime must be HH:mm format'),
    body('type')
      .optional()
      .isIn([...APPOINTMENT_TYPES])
      .withMessage(`type must be one of: ${APPOINTMENT_TYPES.join(', ')}`),
    body('meetingLink').optional().isURL().withMessage('meetingLink must be a valid URL'),
    body('notes').optional().trim(),
  ];
}

/**
 * Status transition validation.
 */
export function statusTransitionValidation(): Array<
  ReturnType<typeof body> | ReturnType<typeof param>
> {
  return [
    param('id').isMongoId().withMessage('Invalid appointment ID'),
    body('status')
      .notEmpty()
      .withMessage('status is required')
      .isIn([...APPOINTMENT_STATUSES])
      .withMessage(`status must be one of: ${APPOINTMENT_STATUSES.join(', ')}`),
  ];
}

/**
 * List appointments query validation.
 */
export function listAppointmentValidation(): ReturnType<typeof query>[] {
  return [
    query('dateFrom').optional().isISO8601().withMessage('dateFrom must be ISO 8601'),
    query('dateTo').optional().isISO8601().withMessage('dateTo must be ISO 8601'),
    query('staffId').optional().isMongoId().withMessage('staffId must be a valid ObjectId'),
    query('userId').optional().isMongoId().withMessage('userId must be a valid ObjectId'),
    query('status')
      .optional()
      .isIn([...APPOINTMENT_STATUSES])
      .withMessage('Invalid status'),
    query('orderId').optional().isMongoId().withMessage('orderId must be a valid ObjectId'),
    query('page').optional().isInt({ min: 1 }).withMessage('page must be >= 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1-100'),
  ];
}

/**
 * Single appointment ID validation.
 */
export function appointmentIdValidation(): ReturnType<typeof param>[] {
  return [param('id').isMongoId().withMessage('Invalid appointment ID')];
}

/**
 * Staff availability set/block validation.
 */
export function staffAvailabilityValidation(): Array<
  ReturnType<typeof body> | ReturnType<typeof param>
> {
  return [
    param('staffId').isMongoId().withMessage('Invalid staff ID'),
    body('dayOfWeek')
      .isInt({ min: 0, max: 6 })
      .withMessage('dayOfWeek must be 0 (Sun) through 6 (Sat)'),
    body('startTime')
      .notEmpty()
      .withMessage('startTime is required')
      .matches(TIME_PATTERN)
      .withMessage('startTime must be HH:mm format'),
    body('endTime')
      .notEmpty()
      .withMessage('endTime is required')
      .matches(TIME_PATTERN)
      .withMessage('endTime must be HH:mm format'),
    body('isBlocked').optional().isBoolean().withMessage('isBlocked must be a boolean'),
    body('blockDate').optional().isISO8601().withMessage('blockDate must be a valid ISO 8601 date'),
    body('blockReason').optional().trim(),
  ];
}

/**
 * Staff availability query validation.
 */
export function availabilityQueryValidation(): Array<
  ReturnType<typeof query> | ReturnType<typeof param>
> {
  return [
    param('staffId').isMongoId().withMessage('Invalid staff ID'),
    query('dateFrom')
      .notEmpty()
      .withMessage('dateFrom is required')
      .isISO8601()
      .withMessage('dateFrom must be ISO 8601'),
    query('dateTo')
      .notEmpty()
      .withMessage('dateTo is required')
      .isISO8601()
      .withMessage('dateTo must be ISO 8601'),
  ];
}
