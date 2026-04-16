/**
 * Analytics Validators — express-validator chains for all 11 endpoints
 */

import { query, body } from 'express-validator';
import { MAX_DATE_RANGE_DAYS, ANALYTICS_VIEWS } from '../constants';

/**
 * Validate dateFrom/dateTo query params with max range constraint (ANA-INV-05).
 */
export function validateDateRange(): ReturnType<typeof query>[] {
  return [
    query('dateFrom').isISO8601().withMessage('dateFrom must be ISO 8601'),
    query('dateTo')
      .isISO8601()
      .withMessage('dateTo must be ISO 8601')
      .custom((dateTo: string, { req }) => {
        const from = new Date(req.query?.dateFrom as string);
        const to = new Date(dateTo);
        if (to <= from) {
          throw new Error('dateTo must be after dateFrom');
        }
        const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > MAX_DATE_RANGE_DAYS) {
          throw new Error(`Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days`);
        }
        return true;
      }),
  ];
}

/**
 * Validate CLV request body.
 */
export function validateClv(): ReturnType<typeof body>[] {
  return [
    body('topN').optional().isInt({ min: 1, max: 100 }).withMessage('topN must be integer 1-100'),
    body('segment').optional().isString().trim().isLength({ min: 1, max: 50 }),
    body('dateFrom').optional().isISO8601(),
    body('dateTo').optional().isISO8601(),
  ];
}

/**
 * Validate channel ROI request body.
 */
export function validateChannelRoi(): ReturnType<typeof body>[] {
  return [
    body('dateFrom').isISO8601().withMessage('dateFrom must be ISO 8601'),
    body('dateTo').isISO8601().withMessage('dateTo must be ISO 8601'),
    body('channels').optional().isArray().withMessage('channels must be an array'),
    body('channels.*').optional().isString().trim(),
  ];
}

/**
 * Validate export request body.
 */
export function validateExport(): ReturnType<typeof body>[] {
  return [
    body('format').isIn(['pdf', 'xlsx']).withMessage('format must be pdf or xlsx'),
    body('widgets').isArray({ min: 1 }).withMessage('widgets must be a non-empty array'),
    body('widgets.*')
      .isIn([...ANALYTICS_VIEWS])
      .withMessage(`widget must be one of: ${ANALYTICS_VIEWS.join(', ')}`),
    body('dateFrom').optional().isISO8601(),
    body('dateTo').optional().isISO8601(),
  ];
}

/**
 * Validate financial year param (e.g., "2025-2026").
 */
export function validateFinancialYear(): ReturnType<typeof query>[] {
  return [
    query('financialYear')
      .matches(/^\d{4}-\d{4}$/)
      .withMessage('financialYear must be in format YYYY-YYYY (e.g., 2025-2026)')
      .custom((fy: string) => {
        const [start, end] = fy.split('-').map(Number);
        if (end !== start + 1) {
          throw new Error('Financial year end must be start + 1');
        }
        return true;
      }),
  ];
}

/**
 * Validate granularity query param.
 */
export function validateGranularity(): ReturnType<typeof query>[] {
  return [
    query('granularity')
      .optional()
      .isIn(['week', 'month'])
      .withMessage('granularity must be week or month'),
  ];
}
