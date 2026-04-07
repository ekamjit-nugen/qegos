/**
 * Tax Engine — Integration Tests (E2)
 *
 * Tests the tax engine service logic: rule activation, test suite,
 * estimate storage patterns, amendment workflow, and locking.
 * Uses the built-in test suite as a verification mechanism.
 */

import { runTaxRuleTestSuite } from '../src/modules/tax-engine/taxRuleTestSuite';
import { calculateTaxEstimate } from '../src/modules/tax-engine/taxCalculator';
import type { ITaxRuleConfig, TaxEstimateInput } from '../src/modules/tax-engine/taxEngine.types';

// ─── Test Rules (FY2024-25) ─────────────────────────────────────────────────

const VALID_RULES: ITaxRuleConfig = {
  snapshotId: 'int-test-snapshot-001',
  name: 'FY2024-25 Integration Test Rules',
  financialYear: '2024-25',
  version: 1,
  effectiveFrom: new Date('2024-07-01'),
  effectiveTo: new Date('2025-06-30'),
  status: 'active',
  brackets: [
    { min: 0, max: 1820000, rate: 0, baseTax: 0 },
    { min: 1820000, max: 4500000, rate: 0.16, baseTax: 0 },
    { min: 4500000, max: 13500000, rate: 0.30, baseTax: 428800 },
    { min: 13500000, max: 19000000, rate: 0.37, baseTax: 3128800 },
    { min: 19000000, max: null, rate: 0.45, baseTax: 5163800 },
  ],
  nonResidentBrackets: [
    { min: 0, max: 13500000, rate: 0.30, baseTax: 0 },
    { min: 13500000, max: 19000000, rate: 0.37, baseTax: 4050000 },
    { min: 19000000, max: null, rate: 0.45, baseTax: 6085000 },
  ],
  workingHolidayBrackets: [
    { min: 0, max: 4500000, rate: 0.15, baseTax: 0 },
    { min: 4500000, max: 13500000, rate: 0.30, baseTax: 675000 },
    { min: 13500000, max: 19000000, rate: 0.37, baseTax: 3375000 },
    { min: 19000000, max: null, rate: 0.45, baseTax: 5410000 },
  ],
  medicareLevy: {
    rate: 0.02,
    surchargeRate: 0.015,
    lowIncomeThreshold: 2630800,
    phaseInRange: 328800,
    familyThreshold: 4432500,
    additionalChildAmount: 407200,
  },
  medicareLevySurchargeTiers: [
    { min: 9300000, max: 10800000, rate: 0.01 },
    { min: 10800000, max: 14400000, rate: 0.0125 },
    { min: 14400000, max: null, rate: 0.015 },
  ],
  medicareLevySeniorSingleThreshold: 3845100,
  medicareLevyFamilyPerChild: 407200,
  hecsHelp: [
    { min: 5488000, max: 6344999, rate: 0.01 },
    { min: 6345000, max: 6906499, rate: 0.02 },
    { min: 6906500, max: 7283399, rate: 0.025 },
    { min: 7283400, max: 7701999, rate: 0.03 },
    { min: 7702000, max: 8282999, rate: 0.035 },
    { min: 8283000, max: 8913199, rate: 0.04 },
    { min: 8913200, max: 9598999, rate: 0.045 },
    { min: 9599000, max: 10347599, rate: 0.05 },
    { min: 10347600, max: 11166199, rate: 0.055 },
    { min: 11166200, max: 12063599, rate: 0.06 },
    { min: 12063600, max: 13049199, rate: 0.065 },
    { min: 13049200, max: 14133199, rate: 0.07 },
    { min: 14133200, max: 15327399, rate: 0.075 },
    { min: 15327400, max: 16645599, rate: 0.08 },
    { min: 16645600, max: 18103999, rate: 0.085 },
    { min: 18104000, max: 19720999, rate: 0.09 },
    { min: 19721000, max: 21518599, rate: 0.095 },
    { min: 21518600, max: null, rate: 0.10 },
  ],
  lito: {
    maxOffset: 70000,
    lowerThreshold: 3750000,
    upperThreshold: 6625000,
    reductionRate: 0.05,
  },
  sapto: {
    maxSingle: 244600,
    maxCouple: 183200,
    thresholdSingle: 3290000,
    phaseOutRate: 0.125,
  },
  cgtDiscount: 0.50,
  instantAssetWriteOff: 2000000,
  superannuationRate: 0.115,
  gstRate: 0.10,
  changeLog: [],
  usageCount: 0,
  isFrozen: false,
} as unknown as ITaxRuleConfig;

// ═══════════════════════════════════════════════════════════════════════════════

describe('Tax Engine — Integration', () => {
  // ── VER-INV-02: Built-in Test Suite ──────────────────────────────────

  describe('Built-in test suite (VER-INV-02)', () => {
    it('all 12 test cases pass against valid rules', () => {
      const results = runTaxRuleTestSuite(VALID_RULES);
      expect(results).toHaveLength(12);

      const failed = results.filter((r) => !r.passed);
      if (failed.length > 0) {
        // Log failures for debugging
        for (const f of failed) {
          console.warn(`FAILED: ${f.name}`, f.details || '', 'expected:', f.expected, 'actual:', f.actual); // eslint-disable-line no-console
        }
      }
      expect(failed).toHaveLength(0);
    });

    it('returns results for each named test case', () => {
      const results = runTaxRuleTestSuite(VALID_RULES);
      const names = results.map((r) => r.name);

      expect(names).toContain('Zero income — tax and refund should be zero');
      expect(names).toContain('Below tax-free threshold ($18,200) — zero tax, zero Medicare');
      expect(names).toContain('Just above threshold ($18,201) — minimal tax applies');
      expect(names).toContain('Median income ($65,000) — correct bracket calculation');
      expect(names).toContain('High income ($100K) without PHI — Medicare Levy Surcharge applied');
      expect(names).toContain('Senior low income ($32,000) — SAPTO offset applied');
      expect(names).toContain('Non-resident ($50K) — 30% flat, no LITO, no Medicare');
      expect(names).toContain('Negative gearing ($80K employ, -$10K rental) — taxable income = $70K');
      expect(names).toContain('CGT 50% discount (resident, $20K long-term) — $10K included');
      expect(names).toContain('HECS minimum tier ($54,880) — 1% compulsory repayment');
      expect(names).toContain('Franking credit excess ($10K income, $5K franking) — excess refunded');
      expect(names).toContain('Standard deduction ($250 work-related only) — warning shown');
    });

    it('detects broken rules (wrong bracket rates)', () => {
      const brokenRules = {
        ...VALID_RULES,
        brackets: [
          // Broken: non-zero baseTax for first bracket
          { min: 0, max: 1800000, rate: 0.10, baseTax: 500000 },
          { min: 1800000, max: null, rate: 0.50, baseTax: 0 },
        ],
      } as unknown as ITaxRuleConfig;

      const results = runTaxRuleTestSuite(brokenRules);
      const failedCount = results.filter((r) => !r.passed).length;
      // At least the zero-income and sub-threshold tests should fail
      expect(failedCount).toBeGreaterThan(0);
    });
  });

  // ── Estimate Output Immutability ─────────────────────────────────────

  describe('Estimate output references rules snapshot', () => {
    it('output contains rulesSnapshotId from rules', () => {
      const input: TaxEstimateInput = {
        financialYear: '2024-25',
        residencyStatus: 'resident',
        grossEmploymentIncome: 6500000,
        businessIncome: 0,
        rentalIncome: 0,
        interestIncome: 0,
        dividendIncome: 0,
        dividendFrankingCredits: 0,
        capitalGains: { shortTerm: 0, longTerm: 0 },
        foreignIncome: 0,
        governmentPayments: 0,
        superannuationIncome: 0,
        deductions: {
          workRelated: 0, selfEducation: 0, vehicleExpenses: 0, homeOffice: 0,
          donations: 0, incomeProtection: 0, accountingFees: 0, other: 0,
        },
        privateHealthInsurance: true,
        hasHecsDebt: false,
        hasSfssDebt: false,
        isEligibleSenior: false,
        numberOfDependants: 0,
        taxWithheld: 0,
      };

      const output = calculateTaxEstimate(input, VALID_RULES);
      expect(output.rulesSnapshotId).toBe('int-test-snapshot-001');
      expect(output.rulesVersion).toBe(1);
    });
  });

  // ── Amendment Workflow Logic ──────────────────────────────────────────

  describe('Amendment workflow', () => {
    it('amendment should use same rules as original for reproducibility', () => {
      // Simulate: original calculation vs amendment with same input
      const input: TaxEstimateInput = {
        financialYear: '2024-25',
        residencyStatus: 'resident',
        grossEmploymentIncome: 8500000,
        businessIncome: 0,
        rentalIncome: 0,
        interestIncome: 0,
        dividendIncome: 0,
        dividendFrankingCredits: 0,
        capitalGains: { shortTerm: 0, longTerm: 0 },
        foreignIncome: 0,
        governmentPayments: 0,
        superannuationIncome: 0,
        deductions: {
          workRelated: 50000, selfEducation: 0, vehicleExpenses: 0, homeOffice: 0,
          donations: 0, incomeProtection: 0, accountingFees: 0, other: 0,
        },
        privateHealthInsurance: true,
        hasHecsDebt: false,
        hasSfssDebt: false,
        isEligibleSenior: false,
        numberOfDependants: 0,
        taxWithheld: 2000000,
      };

      const original = calculateTaxEstimate(input, VALID_RULES);

      // Amendment: changed income
      const amendedInput = {
        ...input,
        grossEmploymentIncome: 9000000,
      };
      const amendment = calculateTaxEstimate(amendedInput, VALID_RULES);

      // Both use same rules
      expect(original.rulesSnapshotId).toBe(amendment.rulesSnapshotId);
      // Amendment has higher tax (higher income)
      expect(amendment.baseTax).toBeGreaterThan(original.baseTax);
      // Variance can be calculated
      const variance = amendment.totalTaxPayable - original.totalTaxPayable;
      expect(variance).toBeGreaterThan(0);
    });
  });

  // ── Comparison Logic ─────────────────────────────────────────────────

  describe('Side-by-side comparison', () => {
    it('two different inputs produce different results with same rules', () => {
      const baseInput: TaxEstimateInput = {
        financialYear: '2024-25',
        residencyStatus: 'resident',
        grossEmploymentIncome: 6500000,
        businessIncome: 0,
        rentalIncome: 0,
        interestIncome: 0,
        dividendIncome: 0,
        dividendFrankingCredits: 0,
        capitalGains: { shortTerm: 0, longTerm: 0 },
        foreignIncome: 0,
        governmentPayments: 0,
        superannuationIncome: 0,
        deductions: {
          workRelated: 0, selfEducation: 0, vehicleExpenses: 0, homeOffice: 0,
          donations: 0, incomeProtection: 0, accountingFees: 0, other: 0,
        },
        privateHealthInsurance: true,
        hasHecsDebt: false,
        hasSfssDebt: false,
        isEligibleSenior: false,
        numberOfDependants: 0,
        taxWithheld: 1500000,
      };

      const resultA = calculateTaxEstimate(baseInput, VALID_RULES);
      const resultB = calculateTaxEstimate(
        { ...baseInput, grossEmploymentIncome: 13000000 },
        VALID_RULES,
      );

      expect(resultB.baseTax).toBeGreaterThan(resultA.baseTax);
      expect(resultB.totalTaxPayable).toBeGreaterThan(resultA.totalTaxPayable);
    });
  });
});
