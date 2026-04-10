/**
 * Form Mapping — express-validator chains.
 *
 * These validators cover only the shape of the incoming HTTP payload.
 * Domain invariants (duplicate fieldKey, widget/type mismatch, draft-exists,
 * default-locked, etc.) are enforced in the service layer so that the
 * error responses carry the `FormMappingErrorCode` constants.
 */

import { body, param, query } from 'express-validator';
import type { ValidationChain } from 'express-validator';

export function listMappingsValidation(): ValidationChain[] {
  return [
    query('salesItemId').optional().isMongoId().withMessage('Invalid salesItemId'),
    query('financialYear')
      .optional()
      .matches(/^\d{4}-\d{4}$/)
      .withMessage('financialYear must be YYYY-YYYY'),
  ];
}

export function createMappingValidation(): ValidationChain[] {
  return [
    body('salesItemId').isMongoId().withMessage('salesItemId is required'),
    body('financialYear')
      .matches(/^\d{4}-\d{4}$/)
      .withMessage('financialYear must be YYYY-YYYY'),
    body('title').trim().notEmpty().withMessage('title is required').isLength({ max: 200 }),
    body('description').optional().isString().isLength({ max: 2000 }),
    body('schema').isObject().withMessage('schema must be an object'),
    body('uiOrder').optional().isArray().withMessage('uiOrder must be an array of step ids'),
    body('notes').optional().isString().isLength({ max: 2000 }),
  ];
}

export function mappingIdParam(): ValidationChain[] {
  return [param('mappingId').isMongoId().withMessage('Invalid mappingId')];
}

export function versionParams(): ValidationChain[] {
  return [
    param('mappingId').isMongoId().withMessage('Invalid mappingId'),
    param('version').isInt({ min: 1 }).withMessage('version must be a positive integer').toInt(),
  ];
}

export function updateDraftValidation(): ValidationChain[] {
  return [
    ...versionParams(),
    body('title').optional().isString().isLength({ min: 1, max: 200 }),
    body('description').optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body('schema').optional().isObject(),
    body('uiOrder').optional().isArray(),
    body('notes').optional().isString().isLength({ max: 2000 }),
  ];
}

export function forkVersionValidation(): ValidationChain[] {
  return [
    ...mappingIdParam(),
    body('sourceVersion').isInt({ min: 1 }).withMessage('sourceVersion is required').toInt(),
    body('notes').optional().isString().isLength({ max: 2000 }),
  ];
}

export function validateSchemaValidation(): ValidationChain[] {
  return [body('schema').isObject().withMessage('schema must be an object')];
}
