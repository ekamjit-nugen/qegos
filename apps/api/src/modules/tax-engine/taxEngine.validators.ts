import { body, param, query } from 'express-validator';
import type { ValidationChain } from 'express-validator';
import {
  RESIDENCY_STATUSES,
  ESTIMATE_CONTEXTS,
  TAX_RESULT_SOURCES,
  LODGEMENT_METHODS,
} from './taxEngine.types';

// ─── Tax Rule Validators ───────────────────────────────────────────────────

export function createRuleDraftValidation(): ValidationChain[] {
  return [
    body('name').trim().notEmpty().withMessage('Rule name is required'),
    body('financialYear')
      .trim()
      .notEmpty()
      .withMessage('Financial year is required')
      .matches(/^\d{4}-\d{2}$/)
      .withMessage('Financial year must be in YYYY-YY format'),
    body('effectiveFrom')
      .notEmpty()
      .withMessage('Effective from date is required')
      .isISO8601()
      .withMessage('Must be a valid date'),
    body('effectiveTo')
      .notEmpty()
      .withMessage('Effective to date is required')
      .isISO8601()
      .withMessage('Must be a valid date'),
    body('brackets').isArray({ min: 1 }).withMessage('At least one tax bracket is required'),
    body('brackets.*.min')
      .isInt({ min: 0 })
      .withMessage('Bracket min must be a non-negative integer (cents)'),
    body('brackets.*.max')
      .optional({ values: 'null' })
      .isInt({ min: 0 })
      .withMessage('Bracket max must be a non-negative integer (cents)'),
    body('brackets.*.rate').isFloat({ min: 0, max: 1 }).withMessage('Bracket rate must be 0-1'),
    body('brackets.*.baseTax')
      .isInt({ min: 0 })
      .withMessage('Bracket baseTax must be a non-negative integer (cents)'),
    body('nonResidentBrackets')
      .isArray({ min: 1 })
      .withMessage('At least one non-resident bracket is required'),
    body('nonResidentBrackets.*.min')
      .isInt({ min: 0 })
      .withMessage('Non-resident bracket min must be non-negative'),
    body('nonResidentBrackets.*.rate')
      .isFloat({ min: 0, max: 1 })
      .withMessage('Non-resident bracket rate must be 0-1'),
    body('nonResidentBrackets.*.baseTax')
      .isInt({ min: 0 })
      .withMessage('Non-resident bracket baseTax must be non-negative'),
    body('workingHolidayBrackets')
      .isArray({ min: 1 })
      .withMessage('At least one WHM bracket is required'),
    body('workingHolidayBrackets.*.min')
      .isInt({ min: 0 })
      .withMessage('WHM bracket min must be non-negative'),
    body('workingHolidayBrackets.*.rate')
      .isFloat({ min: 0, max: 1 })
      .withMessage('WHM bracket rate must be 0-1'),
    body('workingHolidayBrackets.*.baseTax')
      .isInt({ min: 0 })
      .withMessage('WHM bracket baseTax must be non-negative'),
    body('medicareLevy').isObject().withMessage('Medicare levy config is required'),
    body('medicareLevy.rate')
      .isFloat({ min: 0, max: 1 })
      .withMessage('Medicare levy rate must be 0-1'),
    body('medicareLevy.lowIncomeThreshold')
      .isInt({ min: 0 })
      .withMessage('Medicare low income threshold must be non-negative'),
    body('medicareLevy.phaseInRange')
      .isInt({ min: 0 })
      .withMessage('Medicare phase-in range must be non-negative'),
    body('medicareLevy.familyThreshold')
      .isInt({ min: 0 })
      .withMessage('Medicare family threshold must be non-negative'),
    body('medicareLevy.additionalChildAmount')
      .isInt({ min: 0 })
      .withMessage('Medicare additional child amount must be non-negative'),
    body('hecsHelp').isArray().withMessage('HECS-HELP tiers must be an array'),
    body('lito').isObject().withMessage('LITO config is required'),
    body('lito.maxOffset').isInt({ min: 0 }).withMessage('LITO max offset must be non-negative'),
    body('lito.lowerThreshold')
      .isInt({ min: 0 })
      .withMessage('LITO lower threshold must be non-negative'),
    body('lito.upperThreshold')
      .isInt({ min: 0 })
      .withMessage('LITO upper threshold must be non-negative'),
    body('lito.reductionRate')
      .isFloat({ min: 0, max: 1 })
      .withMessage('LITO reduction rate must be 0-1'),
    body('sapto').isObject().withMessage('SAPTO config is required'),
    body('sapto.maxSingle').isInt({ min: 0 }).withMessage('SAPTO max single must be non-negative'),
    body('sapto.maxCouple').isInt({ min: 0 }).withMessage('SAPTO max couple must be non-negative'),
    body('sapto.thresholdSingle')
      .isInt({ min: 0 })
      .withMessage('SAPTO threshold must be non-negative'),
    body('sapto.phaseOutRate')
      .isFloat({ min: 0, max: 1 })
      .withMessage('SAPTO phase-out rate must be 0-1'),
    body('cgtDiscount')
      .optional()
      .isFloat({ min: 0, max: 1 })
      .withMessage('CGT discount must be 0-1'),
    body('superannuationRate')
      .isFloat({ min: 0, max: 1 })
      .withMessage('Superannuation rate must be 0-1'),
    body('gstRate').isFloat({ min: 0, max: 1 }).withMessage('GST rate must be 0-1'),
  ];
}

export function updateRuleDraftValidation(): ValidationChain[] {
  return [
    param('id').isMongoId().withMessage('Invalid rule ID'),
    body('name').optional().trim().notEmpty().withMessage('Rule name cannot be empty'),
    body('brackets')
      .optional()
      .isArray({ min: 1 })
      .withMessage('At least one tax bracket is required'),
    body('nonResidentBrackets')
      .optional()
      .isArray({ min: 1 })
      .withMessage('At least one non-resident bracket is required'),
    body('workingHolidayBrackets')
      .optional()
      .isArray({ min: 1 })
      .withMessage('At least one WHM bracket is required'),
    body('medicareLevy').optional().isObject().withMessage('Medicare levy must be an object'),
    body('hecsHelp').optional().isArray().withMessage('HECS-HELP tiers must be an array'),
    body('lito').optional().isObject().withMessage('LITO must be an object'),
    body('sapto').optional().isObject().withMessage('SAPTO must be an object'),
  ];
}

export function activateRuleValidation(): ValidationChain[] {
  return [param('id').isMongoId().withMessage('Invalid rule ID')];
}

export function correctRuleValidation(): ValidationChain[] {
  return [
    param('snapshotId')
      .trim()
      .notEmpty()
      .withMessage('Snapshot ID is required')
      .isUUID()
      .withMessage('Snapshot ID must be a valid UUID'),
    body('changeReason')
      .trim()
      .notEmpty()
      .withMessage('Change reason is required')
      .isLength({ min: 10 })
      .withMessage('Change reason must be at least 10 characters'),
    body('corrections').isObject().withMessage('Corrections must be an object'),
  ];
}

export function listRulesValidation(): ValidationChain[] {
  return [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1').toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be 1-100')
      .toInt(),
    query('status')
      .optional()
      .isIn(['draft', 'active', 'superseded', 'frozen'])
      .withMessage('Invalid status'),
    query('financialYear')
      .optional()
      .matches(/^\d{4}-\d{2}$/)
      .withMessage('Financial year must be YYYY-YY format'),
  ];
}

export function ruleByIdValidation(): ValidationChain[] {
  return [param('id').isMongoId().withMessage('Invalid rule ID')];
}

export function ruleBySnapshotValidation(): ValidationChain[] {
  return [
    param('snapshotId')
      .trim()
      .notEmpty()
      .withMessage('Snapshot ID is required')
      .isUUID()
      .withMessage('Snapshot ID must be a valid UUID'),
  ];
}

export function ruleHistoryValidation(): ValidationChain[] {
  return [
    param('financialYear')
      .trim()
      .notEmpty()
      .withMessage('Financial year is required')
      .matches(/^\d{4}-\d{2}$/)
      .withMessage('Financial year must be YYYY-YY format'),
  ];
}

// ─── Tax Estimate Validators ───────────────────────────────────────────────

function taxEstimateInputChain(): ValidationChain[] {
  return [
    body('financialYear')
      .trim()
      .notEmpty()
      .withMessage('Financial year is required')
      .matches(/^\d{4}-\d{2}$/)
      .withMessage('Financial year must be YYYY-YY format'),
    body('residencyStatus')
      .trim()
      .notEmpty()
      .withMessage('Residency status is required')
      .isIn([...RESIDENCY_STATUSES])
      .withMessage('Invalid residency status'),
    body('grossEmploymentIncome')
      .isInt()
      .withMessage('Gross employment income must be an integer (cents)')
      .toInt(),
    body('businessIncome')
      .optional({ values: 'null' })
      .isInt()
      .withMessage('Business income must be an integer (cents)')
      .toInt(),
    body('rentalIncome')
      .optional({ values: 'null' })
      .isInt()
      .withMessage('Rental income must be an integer (cents)')
      .toInt(),
    body('interestIncome')
      .optional({ values: 'null' })
      .isInt({ min: 0 })
      .withMessage('Interest income must be non-negative (cents)')
      .toInt(),
    body('dividendIncome')
      .optional({ values: 'null' })
      .isInt({ min: 0 })
      .withMessage('Dividend income must be non-negative (cents)')
      .toInt(),
    body('dividendFrankingCredits')
      .optional({ values: 'null' })
      .isInt({ min: 0 })
      .withMessage('Franking credits must be non-negative (cents)')
      .toInt(),
    body('capitalGains').optional().isObject().withMessage('Capital gains must be an object'),
    body('capitalGains.shortTerm')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Short-term capital gains must be non-negative')
      .toInt(),
    body('capitalGains.longTerm')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Long-term capital gains must be non-negative')
      .toInt(),
    body('foreignIncome')
      .optional({ values: 'null' })
      .isInt({ min: 0 })
      .withMessage('Foreign income must be non-negative (cents)')
      .toInt(),
    body('governmentPayments')
      .optional({ values: 'null' })
      .isInt({ min: 0 })
      .withMessage('Government payments must be non-negative (cents)')
      .toInt(),
    body('superannuationIncome')
      .optional({ values: 'null' })
      .isInt({ min: 0 })
      .withMessage('Superannuation income must be non-negative (cents)')
      .toInt(),
    body('deductions').optional().isObject().withMessage('Deductions must be an object'),
    body('deductions.workRelated')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Work-related deductions must be non-negative')
      .toInt(),
    body('deductions.selfEducation')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Self-education deductions must be non-negative')
      .toInt(),
    body('deductions.vehicleExpenses')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Vehicle expenses must be non-negative')
      .toInt(),
    body('deductions.homeOffice')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Home office deductions must be non-negative')
      .toInt(),
    body('deductions.donations')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Donations must be non-negative')
      .toInt(),
    body('deductions.incomeProtection')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Income protection must be non-negative')
      .toInt(),
    body('deductions.accountingFees')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Accounting fees must be non-negative')
      .toInt(),
    body('deductions.other')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Other deductions must be non-negative')
      .toInt(),
    body('privateHealthInsurance')
      .optional()
      .isBoolean()
      .withMessage('Private health insurance must be boolean'),
    body('hasHecsDebt').optional().isBoolean().withMessage('HECS debt flag must be boolean'),
    body('hasSfssDebt').optional().isBoolean().withMessage('SFSS debt flag must be boolean'),
    body('isEligibleSenior')
      .optional()
      .isBoolean()
      .withMessage('Eligible senior flag must be boolean'),
    body('spouseIncome')
      .optional({ values: 'null' })
      .isInt({ min: 0 })
      .withMessage('Spouse income must be non-negative (cents)')
      .toInt(),
    body('numberOfDependants')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Number of dependants must be non-negative')
      .toInt(),
    body('taxWithheld')
      .optional({ values: 'null' })
      .isInt({ min: 0 })
      .withMessage('Tax withheld must be non-negative (cents)')
      .toInt(),
  ];
}

export function calculateEstimateValidation(): ValidationChain[] {
  return [
    body('context')
      .trim()
      .notEmpty()
      .withMessage('Estimate context is required')
      .isIn([...ESTIMATE_CONTEXTS])
      .withMessage('Invalid estimate context'),
    body('userId').optional().isMongoId().withMessage('Invalid user ID'),
    body('leadId').optional().isMongoId().withMessage('Invalid lead ID'),
    body('orderId').optional().isMongoId().withMessage('Invalid order ID'),
    ...taxEstimateInputChain(),
  ];
}

export function quickEstimateValidation(): ValidationChain[] {
  return [
    body('income')
      .isInt({ min: 0 })
      .withMessage('Income must be a non-negative integer (cents)')
      .toInt(),
    body('deductions')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Deductions must be a non-negative integer (cents)')
      .toInt(),
    body('residencyStatus')
      .optional()
      .isIn([...RESIDENCY_STATUSES])
      .withMessage('Invalid residency status'),
  ];
}

export function recalculateValidation(): ValidationChain[] {
  return [
    param('snapshotId')
      .trim()
      .notEmpty()
      .withMessage('Snapshot ID is required')
      .isUUID()
      .withMessage('Snapshot ID must be a valid UUID'),
    ...taxEstimateInputChain(),
  ];
}

export function compareEstimatesValidation(): ValidationChain[] {
  return [
    body('snapshotId').optional().isUUID().withMessage('Snapshot ID must be a valid UUID'),
    body('inputA').isObject().withMessage('Input A is required'),
    body('inputB').isObject().withMessage('Input B is required'),
  ];
}

// ─── Tax Result Validators ─────────────────────────────────────────────────

export function createResultValidation(): ValidationChain[] {
  return [
    body('orderId')
      .trim()
      .notEmpty()
      .withMessage('Order ID is required')
      .isMongoId()
      .withMessage('Invalid order ID'),
    body('userId')
      .trim()
      .notEmpty()
      .withMessage('User ID is required')
      .isMongoId()
      .withMessage('Invalid user ID'),
    body('financialYear')
      .trim()
      .notEmpty()
      .withMessage('Financial year is required')
      .matches(/^\d{4}-\d{2}$/)
      .withMessage('Financial year must be YYYY-YY format'),
    body('rulesSnapshotId')
      .trim()
      .notEmpty()
      .withMessage('Rules snapshot ID is required')
      .isUUID()
      .withMessage('Must be a valid UUID'),
    body('source')
      .trim()
      .notEmpty()
      .withMessage('Source is required')
      .isIn([...TAX_RESULT_SOURCES])
      .withMessage('Invalid source'),
    body('income').isObject().withMessage('Income breakdown is required'),
    body('income.total').isInt().withMessage('Income total must be an integer (cents)'),
    body('deductions').isObject().withMessage('Deductions breakdown is required'),
    body('deductions.total')
      .isInt({ min: 0 })
      .withMessage('Deductions total must be non-negative (cents)'),
    body('taxableIncome')
      .isInt({ min: 0 })
      .withMessage('Taxable income must be non-negative (cents)')
      .toInt(),
    body('taxOnIncome')
      .isInt({ min: 0 })
      .withMessage('Tax on income must be non-negative (cents)')
      .toInt(),
    body('medicareLevyAmount')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Medicare levy must be non-negative (cents)')
      .toInt(),
    body('totalTaxPayable')
      .isInt({ min: 0 })
      .withMessage('Total tax payable must be non-negative (cents)')
      .toInt(),
    body('taxWithheld')
      .isInt({ min: 0 })
      .withMessage('Tax withheld must be non-negative (cents)')
      .toInt(),
    body('refundOrOwing').isInt().withMessage('Refund or owing must be an integer (cents)').toInt(),
  ];
}

export function updateResultValidation(): ValidationChain[] {
  return [
    param('orderId').isMongoId().withMessage('Invalid order ID'),
    body('source')
      .optional()
      .isIn([...TAX_RESULT_SOURCES])
      .withMessage('Invalid source'),
    body('income').optional().isObject().withMessage('Income must be an object'),
    body('deductions').optional().isObject().withMessage('Deductions must be an object'),
    body('lodgementDate').optional().isISO8601().withMessage('Lodgement date must be a valid date'),
    body('lodgementMethod')
      .optional()
      .isIn([...LODGEMENT_METHODS])
      .withMessage('Invalid lodgement method'),
    body('assessmentDate')
      .optional()
      .isISO8601()
      .withMessage('Assessment date must be a valid date'),
    body('assessmentNoticeRef')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Assessment notice ref too long'),
  ];
}

export function resultByOrderValidation(): ValidationChain[] {
  return [param('orderId').isMongoId().withMessage('Invalid order ID')];
}

export function lockResultValidation(): ValidationChain[] {
  return [param('id').isMongoId().withMessage('Invalid result ID')];
}

export function createAmendmentValidation(): ValidationChain[] {
  return [
    param('orderId').isMongoId().withMessage('Invalid order ID'),
    body('amendmentReason')
      .trim()
      .notEmpty()
      .withMessage('Amendment reason is required')
      .isLength({ min: 10 })
      .withMessage('Amendment reason must be at least 10 characters'),
    body('income').optional().isObject().withMessage('Income must be an object'),
    body('deductions').optional().isObject().withMessage('Deductions must be an object'),
    body('taxableIncome')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Taxable income must be non-negative (cents)')
      .toInt(),
    body('totalTaxPayable')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Total tax payable must be non-negative (cents)')
      .toInt(),
    body('refundOrOwing')
      .optional()
      .isInt()
      .withMessage('Refund or owing must be an integer (cents)')
      .toInt(),
  ];
}

export function estimatesByOrderValidation(): ValidationChain[] {
  return [param('orderId').isMongoId().withMessage('Invalid order ID')];
}
