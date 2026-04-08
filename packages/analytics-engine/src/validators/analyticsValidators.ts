import { body, query } from 'express-validator';
import { MAX_DATE_RANGE_DAYS, ANALYTICS_VIEWS, EXPORT_FORMATS } from '../constants';

/**
 * ANA-INV-05: Date range validation — max 366 days, ISO 8601 format.
 */
export function validateDateRange(): ReturnType<typeof query>[] {
  return [
    query('dateFrom')
      .isISO8601()
      .withMessage('dateFrom must be a valid ISO 8601 date'),
    query('dateTo')
      .isISO8601()
      .withMessage('dateTo must be a valid ISO 8601 date')
      .custom((dateTo: string, { req }) => {
        const dateFrom = (req as { query?: { dateFrom?: string } }).query?.dateFrom;
        if (!dateFrom) return true;
        const from = new Date(dateFrom);
        const to = new Date(dateTo);
        if (to < from) {
          throw new Error('dateTo must be after dateFrom');
        }
        const diffDays = Math.ceil((to.getTime() - from.getTime()) / 86400000);
        if (diffDays > MAX_DATE_RANGE_DAYS) {
          throw new Error(`Date range must not exceed ${MAX_DATE_RANGE_DAYS} days`);
        }
        return true;
      }),
  ];
}

/**
 * CLV endpoint validation.
 */
export function validateClv(): ReturnType<typeof body>[] {
  return [
    body('topN')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('topN must be an integer between 1 and 100'),
    body('dateFrom')
      .optional()
      .isISO8601()
      .withMessage('dateFrom must be a valid ISO 8601 date'),
    body('dateTo')
      .optional()
      .isISO8601()
      .withMessage('dateTo must be a valid ISO 8601 date'),
  ];
}

/**
 * Channel ROI endpoint validation.
 */
export function validateChannelRoi(): ReturnType<typeof body>[] {
  return [
    body('channels')
      .optional()
      .isArray()
      .withMessage('channels must be an array of strings'),
    body('channels.*')
      .optional()
      .isString()
      .withMessage('Each channel must be a string'),
    body('dateFrom')
      .isISO8601()
      .withMessage('dateFrom must be a valid ISO 8601 date'),
    body('dateTo')
      .isISO8601()
      .withMessage('dateTo must be a valid ISO 8601 date'),
  ];
}

/**
 * Export endpoint validation.
 */
export function validateExport(): ReturnType<typeof body>[] {
  return [
    body('format')
      .isIn([...EXPORT_FORMATS])
      .withMessage(`format must be one of: ${EXPORT_FORMATS.join(', ')}`),
    body('widgets')
      .isArray({ min: 1 })
      .withMessage('widgets must be a non-empty array'),
    body('widgets.*')
      .isIn([...ANALYTICS_VIEWS])
      .withMessage(`Each widget must be one of: ${ANALYTICS_VIEWS.join(', ')}`),
    body('dateFrom')
      .isISO8601()
      .withMessage('dateFrom must be a valid ISO 8601 date'),
    body('dateTo')
      .isISO8601()
      .withMessage('dateTo must be a valid ISO 8601 date'),
  ];
}

/**
 * Financial year validation (format: "2024-25").
 */
export function validateFinancialYear(): ReturnType<typeof query>[] {
  return [
    query('financialYear')
      .matches(/^\d{4}-\d{2}$/)
      .withMessage('financialYear must match format YYYY-YY (e.g. 2024-25)'),
  ];
}

/**
 * Granularity validation for seasonal trends.
 */
export function validateGranularity(): ReturnType<typeof query>[] {
  return [
    query('granularity')
      .optional()
      .isIn(['week', 'month'])
      .withMessage('granularity must be "week" or "month"'),
  ];
}
