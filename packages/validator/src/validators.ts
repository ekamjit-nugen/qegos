import { body, query, param } from 'express-validator';
import type { ValidationChain } from 'express-validator';
import { AUSTRALIAN_STATES } from './types';

/**
 * TFN check digit validation per ATO algorithm.
 * Weights: [1, 4, 3, 7, 5, 8, 6, 9, 10], sum mod 11 === 0.
 * FIX for Vegeta B-4: Format-only validation is insufficient for a tax platform.
 */
function isValidTfn(value: string): boolean {
  const digits = value.replace(/\s/g, '');
  if (!/^\d{9}$/.test(digits)) {
    return false;
  }
  const weights = [1, 4, 3, 7, 5, 8, 6, 9, 10];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i], 10) * weights[i];
  }
  return sum > 0 && sum % 11 === 0;
}

/**
 * ABN check digit validation per ABR algorithm.
 * Subtract 1 from first digit, then apply weights [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19],
 * sum mod 89 === 0.
 * FIX for Vegeta B-5: Format-only validation is insufficient.
 */
function isValidAbn(value: string): boolean {
  const digits = value.replace(/\s/g, '');
  if (!/^\d{11}$/.test(digits)) {
    return false;
  }
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const nums = digits.split('').map((d) => parseInt(d, 10));
  nums[0] = nums[0] - 1; // Subtract 1 from first digit
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += nums[i] * weights[i];
  }
  return sum % 89 === 0;
}

/**
 * Escape regex special characters to prevent ReDoS.
 * FIX for Vegeta S-6, B-25: User-supplied strings must be escaped before use in $regex.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function email(field = 'email'): ValidationChain {
  return body(field)
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail();
}

export function phone(field = 'mobile', countryCode = '+61'): ValidationChain {
  const regex = countryCode === '+61' ? /^\+61\d{9}$/ : /^\+\d{10,15}$/;
  return body(field)
    .trim()
    .notEmpty()
    .withMessage('Mobile number is required')
    .matches(regex)
    .withMessage(
      countryCode === '+61'
        ? 'Must be a valid Australian mobile (+61XXXXXXXXX)'
        : `Must be a valid phone number with ${countryCode} prefix`,
    );
}

export function objectId(field = 'id', location: 'param' | 'body' | 'query' = 'param'): ValidationChain {
  const chainFn = location === 'param' ? param : location === 'body' ? body : query;
  return chainFn(field)
    .trim()
    .notEmpty()
    .withMessage(`${field} is required`)
    .isMongoId()
    .withMessage(`${field} must be a valid ID`);
}

export function pagination(): ValidationChain[] {
  return [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer')
      .toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
      .toInt(),
    query('sortBy').optional().trim().isString().withMessage('sortBy must be a string'),
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('sortOrder must be asc or desc'),
  ];
}

export function dateRange(
  fromField = 'dateFrom',
  toField = 'dateTo',
): ValidationChain[] {
  return [
    query(fromField)
      .optional()
      .isISO8601()
      .withMessage(`${fromField} must be a valid ISO 8601 date`),
    query(toField)
      .optional()
      .isISO8601()
      .withMessage(`${toField} must be a valid ISO 8601 date`),
  ];
}

export function tfn(field = 'tfn'): ValidationChain {
  return body(field)
    .trim()
    .notEmpty()
    .withMessage('TFN is required')
    .custom((value: string) => {
      if (!isValidTfn(value)) {
        throw new Error('Must be a valid Australian TFN (9 digits with valid check digit)');
      }
      return true;
    });
}

export function abn(field = 'abn'): ValidationChain {
  return body(field)
    .trim()
    .notEmpty()
    .withMessage('ABN is required')
    .custom((value: string) => {
      if (!isValidAbn(value)) {
        throw new Error('Must be a valid Australian ABN (11 digits with valid check digit)');
      }
      return true;
    });
}

export function postcode(field = 'postcode'): ValidationChain {
  return body(field)
    .trim()
    .notEmpty()
    .withMessage('Postcode is required')
    .matches(/^\d{4}$/)
    .withMessage('Must be a valid 4-digit Australian postcode');
}

export function auState(field = 'state'): ValidationChain {
  return body(field)
    .trim()
    .notEmpty()
    .withMessage('State is required')
    .isIn(AUSTRALIAN_STATES)
    .withMessage(`Must be one of: ${AUSTRALIAN_STATES.join(', ')}`);
}

export function integerCents(field: string): ValidationChain {
  return body(field)
    .notEmpty()
    .withMessage(`${field} is required`)
    .isInt({ min: 0 })
    .withMessage(`${field} must be a non-negative integer (cents)`)
    .custom((value: number) => {
      if (!Number.isInteger(value)) {
        throw new Error(`${field} must be an integer (cents, no decimals)`);
      }
      return true;
    });
}

export function requiredString(field: string, location: 'body' | 'query' | 'param' = 'body'): ValidationChain {
  const chainFn = location === 'body' ? body : location === 'query' ? query : param;
  return chainFn(field)
    .trim()
    .notEmpty()
    .withMessage(`${field} is required`)
    .isString()
    .withMessage(`${field} must be a string`);
}

export function search(field = 'search'): ValidationChain {
  return query(field)
    .optional()
    .trim()
    .isString()
    .withMessage('Search must be a string')
    .isLength({ max: 200 })
    .withMessage('Search must be at most 200 characters');
}

// Export the check digit helpers for testing
export { isValidTfn, isValidAbn };
