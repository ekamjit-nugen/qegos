/**
 * Consent Form — express-validator chains.
 *
 * Runs BEFORE any crypto happens, so invalid input never touches the
 * encryption helpers. Errors surface via the shared `validate()` wrapper.
 */

import { body } from 'express-validator';
import {
  AU_STATES,
  WORK_TYPES,
  GENDERS,
  PRIMARY_ID_TYPES,
  SECONDARY_ID_TYPES,
} from './consentForm.types';

export function createConsentFormValidation() {
  return [
    // Personal
    body('firstName').isString().trim().isLength({ min: 1, max: 100 }),
    body('lastName').isString().trim().isLength({ min: 1, max: 100 }),
    body('email').isEmail().normalizeEmail(),
    body('phone')
      .isString()
      .matches(/^\d{10}$/)
      .withMessage('phone must be 10 digits'),
    body('dateOfBirth')
      .isString()
      .matches(/^\d{4}-\d{2}-\d{2}$/)
      .withMessage('dateOfBirth must be YYYY-MM-DD'),
    body('gender').isIn(GENDERS),

    // Address
    body('houseNumber').isString().trim().isLength({ min: 1, max: 20 }),
    body('streetName').isString().trim().isLength({ min: 1, max: 200 }),
    body('city').isString().trim().isLength({ min: 1, max: 100 }),
    body('postCode')
      .isString()
      .matches(/^\d{4}$/)
      .withMessage('postCode must be 4 digits'),
    body('state').isIn(AU_STATES),

    // Tax & Banking
    body('workType').isIn(WORK_TYPES),
    body('tfnAbnAcn')
      .isString()
      .matches(/^\d+$/)
      .withMessage('tfnAbnAcn must contain only digits')
      .custom((value: string, { req }) => {
        const workType = (req.body as { workType?: string }).workType;
        if (workType === 'TFN' && value.length !== 9) {
          throw new Error('TFN must be 9 digits');
        }
        if (workType === 'ABN' && value.length !== 11) {
          throw new Error('ABN must be 11 digits');
        }
        if (workType === 'ACN' && value.length !== 9) {
          throw new Error('ACN must be 9 digits');
        }
        return true;
      }),
    body('bsb')
      .isString()
      .matches(/^\d{6}$/)
      .withMessage('bsb must be exactly 6 digits'),
    body('accountNumber')
      .isString()
      .matches(/^\d{4,10}$/)
      .withMessage('accountNumber must be 4-10 digits'),
    body('accountName').isString().trim().isLength({ min: 1, max: 200 }),

    // Identification
    body('primaryIdType').isIn(PRIMARY_ID_TYPES),
    body('primaryIdUrl').isString().trim().isLength({ min: 1 }),
    body('secondaryIdType').isIn(SECONDARY_ID_TYPES),
    body('secondaryIdUrl').isString().trim().isLength({ min: 1 }),

    // Consent — must be boolean true
    body('consentAgreement')
      .isBoolean()
      .custom((value: unknown) => {
        if (value !== true) {
          throw new Error('consentAgreement must be true');
        }
        return true;
      }),
  ];
}
