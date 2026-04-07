import type { Document, Types } from 'mongoose';

// ─── Tax Rule Config (Enhanced for Phase 4) ────────────────────────────────

export interface TaxBracket {
  min: number; // cents
  max: number | null; // cents, null = unlimited
  rate: number; // decimal, e.g. 0.16
  baseTax: number; // cents
}

export interface MedicareLevyConfig {
  rate: number; // decimal, e.g. 0.02
  surchargeRate: number; // decimal
  lowIncomeThreshold: number; // cents
  phaseInRange: number; // cents
  familyThreshold: number; // cents
  additionalChildAmount: number; // cents
}

export interface MedicareLevySurchargeTier {
  min: number; // cents
  max: number | null; // cents
  rate: number; // decimal
}

export interface HecsHelpTier {
  min: number; // cents
  max: number | null; // cents
  rate: number; // decimal
}

export interface LitoConfig {
  maxOffset: number; // cents
  lowerThreshold: number; // cents
  upperThreshold: number; // cents
  reductionRate: number; // decimal
}

export interface LmitoConfig {
  maxOffset: number; // cents
  lowerThreshold: number; // cents
  upperThreshold: number; // cents
}

export interface SeniorOffsetConfig {
  maxOffset: number; // cents
  single: number; // cents threshold
  couple: number; // cents threshold
}

export interface SaptoConfig {
  maxSingle: number; // cents
  maxCouple: number; // cents
  thresholdSingle: number; // cents
  phaseOutRate: number; // decimal
}

export interface ChangeLogEntry {
  date: Date;
  field: string;
  from: unknown;
  to: unknown;
  reason: string;
  updatedBy: Types.ObjectId;
}

export type TaxRuleStatus = 'draft' | 'active' | 'superseded' | 'frozen';

export interface ITaxRuleConfig {
  snapshotId: string; // UUID v4, unique, immutable (VER-INV-11)
  name: string;
  financialYear: string; // e.g. "2024-25"
  version: number; // auto-increment per FY
  effectiveFrom: Date;
  effectiveTo: Date;
  status: TaxRuleStatus;
  // Resident brackets
  brackets: TaxBracket[];
  // Non-resident brackets (Phase 4)
  nonResidentBrackets: TaxBracket[];
  // Working holiday maker brackets (Phase 4)
  workingHolidayBrackets: TaxBracket[];
  medicareLevy: MedicareLevyConfig;
  medicareLevySurchargeTiers: MedicareLevySurchargeTier[];
  medicareLevySeniorSingleThreshold: number; // cents
  medicareLevyFamilyPerChild: number; // cents
  hecsHelp: HecsHelpTier[];
  lito: LitoConfig;
  lmito?: LmitoConfig;
  seniorOffset?: SeniorOffsetConfig;
  sapto: SaptoConfig;
  cgtDiscount: number; // 0.50
  instantAssetWriteOff: number; // cents
  superannuationRate: number; // decimal
  gstRate: number; // decimal
  legislationReference?: string;
  budgetReference?: string;
  verifiedBy?: Types.ObjectId;
  verifiedAt?: Date;
  parentSnapshotId?: string; // correction chain
  changeReason?: string; // required if parentSnapshotId
  changeLog: ChangeLogEntry[];
  usageCount: number;
  createdBy: Types.ObjectId;
  isFrozen: boolean;
}

export interface ITaxRuleConfigDocument extends ITaxRuleConfig, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Tax Estimate Input/Output (Pure Function Contract) ────────────────────

export interface TaxEstimateInput {
  financialYear: string;
  residencyStatus: 'resident' | 'non_resident' | 'working_holiday';
  dateOfBirth?: string; // ISO date string for SAPTO eligibility
  grossEmploymentIncome: number; // cents
  businessIncome: number; // cents
  rentalIncome: number; // cents — CAN BE NEGATIVE (negative gearing)
  interestIncome: number; // cents
  dividendIncome: number; // cents
  dividendFrankingCredits: number; // cents
  capitalGains: { shortTerm: number; longTerm: number }; // cents
  foreignIncome: number; // cents
  governmentPayments: number; // cents
  superannuationIncome: number; // cents
  deductions: {
    workRelated: number;
    selfEducation: number;
    vehicleExpenses: number;
    homeOffice: number;
    donations: number;
    incomeProtection: number;
    accountingFees: number;
    other: number;
  }; // ALL cents
  privateHealthInsurance: boolean;
  hasHecsDebt: boolean;
  hasSfssDebt: boolean;
  isEligibleSenior: boolean;
  spouseIncome?: number; // cents
  numberOfDependants: number;
  taxWithheld: number; // cents
  paymentSummaries?: Array<{ employerName: string; grossIncome: number; taxWithheld: number }>;
}

export interface BreakdownItem {
  label: string;
  amount: number; // cents
  type: 'income' | 'deduction' | 'tax' | 'offset' | 'levy' | 'repayment';
}

export interface TaxEstimateOutput {
  grossIncome: number; // cents
  totalDeductions: number; // cents
  taxableIncome: number; // cents
  baseTax: number; // cents
  medicareLevyAmount: number; // cents
  medicareLevySurcharge: number; // cents
  litoOffset: number; // cents
  saptoOffset: number; // cents
  hecsRepayment: number; // cents
  totalTaxPayable: number; // cents — NEVER negative (TAX-INV-04)
  totalTaxWithheld: number; // cents
  estimatedRefundOrOwing: number; // cents — positive = refund
  effectiveTaxRate: number; // percentage (2dp)
  marginalTaxRate: number; // percentage
  breakdown: BreakdownItem[];
  warnings: string[];
  disclaimer: string; // ALWAYS present (TAX-INV-05)
  calculatedAt: Date;
  rulesSnapshotId: string;
  rulesVersion: number;
}

export const RESIDENCY_STATUSES = ['resident', 'non_resident', 'working_holiday'] as const;
export type ResidencyStatus = (typeof RESIDENCY_STATUSES)[number];

// ─── Tax Estimate Log ──────────────────────────────────────────────────────

export const ESTIMATE_CONTEXTS = [
  'client_portal',
  'staff_quick_quote',
  'landing_page',
  'phone_call',
  'order_review',
] as const;
export type EstimateContext = (typeof ESTIMATE_CONTEXTS)[number];

export interface ITaxEstimateLog {
  estimateNumber: string; // QGS-EST-XXXX
  userId?: Types.ObjectId;
  leadId?: Types.ObjectId;
  orderId?: Types.ObjectId;
  financialYear: string;
  rulesSnapshotId: string; // IMMUTABLE
  rulesVersion: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  context: EstimateContext;
  performedBy?: Types.ObjectId;
  expiresAt: Date;
  isDeleted: boolean;
  deletedAt?: Date;
}

export interface ITaxEstimateLogDocument extends ITaxEstimateLog, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Tax Return Result ─────────────────────────────────────────────────────

export const TAX_RESULT_SOURCES = [
  'manual_entry',
  'xero_tax',
  'lodgeit',
  'myob_tax',
  'handitax',
  'other',
] as const;
export type TaxResultSource = (typeof TAX_RESULT_SOURCES)[number];

export const RETURN_TYPES = ['original', 'amendment'] as const;
export type ReturnType = (typeof RETURN_TYPES)[number];

export const LODGEMENT_METHODS = ['ato_portal', 'sbr', 'paper'] as const;
export type LodgementMethod = (typeof LODGEMENT_METHODS)[number];

export const ATO_AMENDMENT_STATUSES = [
  'not_lodged',
  'lodged',
  'processing',
  'completed',
  'rejected',
] as const;
export type AtoAmendmentStatus = (typeof ATO_AMENDMENT_STATUSES)[number];

export interface TaxResultIncome {
  employment: number;
  business: number;
  rental: number;
  interest: number;
  dividends: number;
  frankingCredits: number;
  capitalGains: number;
  foreign: number;
  government: number;
  superannuation: number;
  other: number;
  total: number;
} // ALL cents

export interface TaxResultDeductions {
  workRelated: number;
  selfEducation: number;
  vehicle: number;
  homeOffice: number;
  donations: number;
  incomeProtection: number;
  accounting: number;
  other: number;
  total: number;
} // ALL cents

export interface TaxResultOffsets {
  lito: number;
  sapto: number;
  franking: number;
  other: number;
  total: number;
} // ALL cents

export interface ITaxReturnResult {
  orderId: Types.ObjectId;
  userId: Types.ObjectId;
  financialYear: string;
  rulesSnapshotId: string; // IMMUTABLE after lock
  source: TaxResultSource;
  sourceReference?: string;
  returnType: ReturnType;
  originalReturnId?: Types.ObjectId;
  amendmentNumber?: number;
  amendmentReason?: string;
  amendmentChanges?: Record<string, { from: unknown; to: unknown }>;
  income: TaxResultIncome;
  deductions: TaxResultDeductions;
  taxableIncome: number; // cents
  taxOnIncome: number; // cents
  medicareLevyAmount: number; // cents
  offsets: TaxResultOffsets;
  hecsRepayment: number; // cents
  totalTaxPayable: number; // cents
  taxWithheld: number; // cents
  refundOrOwing: number; // cents
  superannuationTotal?: number; // cents
  lodgementDate?: Date;
  lodgementMethod?: LodgementMethod;
  assessmentDate?: Date;
  assessmentNoticeRef?: string;
  assessmentVariance?: number; // cents
  atoAmendmentRef?: string;
  atoAmendmentStatus?: AtoAmendmentStatus;
  previousEstimateId?: Types.ObjectId;
  preparedAt?: Date;
  isLocked: boolean;
  lockedAt?: Date;
  lockedBy?: Types.ObjectId;
  enteredBy: Types.ObjectId;
  verifiedBy?: Types.ObjectId;
  isDeleted: boolean;
  deletedAt?: Date;
}

export interface ITaxReturnResultDocument extends ITaxReturnResult, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Test Suite Types ──────────────────────────────────────────────────────

export interface TaxRuleTestResult {
  name: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  details?: string;
}

// ─── Service Pagination ────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
