/**
 * Tax Calculator — Pure Function Unit Tests (E1)
 *
 * Tests the calculateTaxEstimate pure function with FY2024-25 rules.
 * All monetary values in integer cents. No database, no side effects.
 */

import { calculateTaxEstimate } from '../src/modules/tax-engine/taxCalculator';
import type { TaxEstimateInput, ITaxRuleConfig } from '../src/modules/tax-engine/taxEngine.types';

// ─── FY2024-25 Test Rules (same as seed data) ──────────────────────────────

const FY2025_RULES: ITaxRuleConfig = {
  snapshotId: 'test-snapshot-001',
  name: 'FY2024-25 Test Rules',
  financialYear: '2024-25',
  version: 1,
  effectiveFrom: new Date('2024-07-01'),
  effectiveTo: new Date('2025-06-30'),
  status: 'active',
  brackets: [
    { min: 0, max: 1820000, rate: 0, baseTax: 0 },
    { min: 1820000, max: 4500000, rate: 0.16, baseTax: 0 },
    { min: 4500000, max: 13500000, rate: 0.3, baseTax: 428800 },
    { min: 13500000, max: 19000000, rate: 0.37, baseTax: 3128800 },
    { min: 19000000, max: null, rate: 0.45, baseTax: 5163800 },
  ],
  nonResidentBrackets: [
    { min: 0, max: 13500000, rate: 0.3, baseTax: 0 },
    { min: 13500000, max: 19000000, rate: 0.37, baseTax: 4050000 },
    { min: 19000000, max: null, rate: 0.45, baseTax: 6085000 },
  ],
  workingHolidayBrackets: [
    { min: 0, max: 4500000, rate: 0.15, baseTax: 0 },
    { min: 4500000, max: 13500000, rate: 0.3, baseTax: 675000 },
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
    { min: 21518600, max: null, rate: 0.1 },
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
  cgtDiscount: 0.5,
  instantAssetWriteOff: 2000000,
  superannuationRate: 0.115,
  gstRate: 0.1,
  changeLog: [],
  usageCount: 0,
  isFrozen: false,
} as unknown as ITaxRuleConfig;

// ─── Helper ─────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<TaxEstimateInput> = {}): TaxEstimateInput {
  const base: TaxEstimateInput = {
    financialYear: '2024-25',
    residencyStatus: 'resident',
    grossEmploymentIncome: 0,
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
      workRelated: 0,
      selfEducation: 0,
      vehicleExpenses: 0,
      homeOffice: 0,
      donations: 0,
      incomeProtection: 0,
      accountingFees: 0,
      other: 0,
    },
    privateHealthInsurance: true,
    hasHecsDebt: false,
    hasSfssDebt: false,
    isEligibleSenior: false,
    numberOfDependants: 0,
    taxWithheld: 0,
  };
  return {
    ...base,
    ...overrides,
    capitalGains: { ...base.capitalGains, ...overrides.capitalGains },
    deductions: { ...base.deductions, ...overrides.deductions },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('calculateTaxEstimate — Pure Function', () => {
  // ── Integer Arithmetic ────────────────────────────────────────────────

  describe('Integer arithmetic (TAX-INV-03)', () => {
    it('all output fields should be integers', () => {
      const input = makeInput({ grossEmploymentIncome: 8500000 }); // $85,000
      const output = calculateTaxEstimate(input, FY2025_RULES);

      expect(Number.isInteger(output.grossIncome)).toBe(true);
      expect(Number.isInteger(output.totalDeductions)).toBe(true);
      expect(Number.isInteger(output.taxableIncome)).toBe(true);
      expect(Number.isInteger(output.baseTax)).toBe(true);
      expect(Number.isInteger(output.medicareLevyAmount)).toBe(true);
      expect(Number.isInteger(output.medicareLevySurcharge)).toBe(true);
      expect(Number.isInteger(output.litoOffset)).toBe(true);
      expect(Number.isInteger(output.saptoOffset)).toBe(true);
      expect(Number.isInteger(output.hecsRepayment)).toBe(true);
      expect(Number.isInteger(output.totalTaxPayable)).toBe(true);
      expect(Number.isInteger(output.estimatedRefundOrOwing)).toBe(true);
    });
  });

  // ── Resident Tax Brackets ────────────────────────────────────────────

  describe('Resident tax brackets', () => {
    it('$0 income — zero base tax, zero taxable income', () => {
      const output = calculateTaxEstimate(makeInput(), FY2025_RULES);
      expect(output.baseTax).toBe(0);
      expect(output.taxableIncome).toBe(0);
      expect(output.totalTaxPayable).toBe(0);
    });

    it('$18,200 — below threshold, zero tax', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 1820000 }),
        FY2025_RULES,
      );
      expect(output.baseTax).toBe(0);
    });

    it('$18,201 — just above threshold, minimal tax', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 1820100 }),
        FY2025_RULES,
      );
      // (1820100 - 1820000) * 0.16 = 100 * 0.16 = 16
      expect(output.baseTax).toBe(Math.round(100 * 0.16));
    });

    it('$45,000 — top of 16% bracket', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 4500000 }),
        FY2025_RULES,
      );
      // 0 + (4500000 - 1820000) * 0.16 = 2680000 * 0.16 = 428800
      expect(output.baseTax).toBe(428800);
    });

    it('$65,000 — in 30% bracket', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 6500000 }),
        FY2025_RULES,
      );
      // 428800 + (6500000 - 4500000) * 0.30 = 428800 + 600000 = 1028800
      expect(output.baseTax).toBe(1028800);
    });

    it('$135,000 — top of 30% bracket', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 13500000 }),
        FY2025_RULES,
      );
      // 428800 + (13500000 - 4500000) * 0.30 = 428800 + 2700000 = 3128800
      expect(output.baseTax).toBe(3128800);
    });

    it('$190,000 — top of 37% bracket', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 19000000 }),
        FY2025_RULES,
      );
      // 3128800 + (19000000 - 13500000) * 0.37 = 3128800 + 2035000 = 5163800
      expect(output.baseTax).toBe(5163800);
    });

    it('$200,000 — in 45% bracket', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 20000000 }),
        FY2025_RULES,
      );
      // 5163800 + (20000000 - 19000000) * 0.45 = 5163800 + 450000 = 5613800
      expect(output.baseTax).toBe(5613800);
    });
  });

  // ── Non-Resident Brackets ────────────────────────────────────────────

  describe('Non-resident brackets', () => {
    it('$50,000 non-resident — 30% flat, no LITO, no Medicare', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 5000000, residencyStatus: 'non_resident' }),
        FY2025_RULES,
      );
      // 0 + 5000000 * 0.30 = 1500000
      expect(output.baseTax).toBe(1500000);
      expect(output.litoOffset).toBe(0);
      expect(output.medicareLevyAmount).toBe(0);
    });

    it('$150,000 non-resident — enters 37% bracket', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 15000000, residencyStatus: 'non_resident' }),
        FY2025_RULES,
      );
      // 4050000 + (15000000 - 13500000) * 0.37 = 4050000 + 555000 = 4605000
      expect(output.baseTax).toBe(4605000);
    });
  });

  // ── Working Holiday Brackets ─────────────────────────────────────────

  describe('Working holiday maker brackets', () => {
    it('$30,000 WHM — 15% flat', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 3000000, residencyStatus: 'working_holiday' }),
        FY2025_RULES,
      );
      // 0 + 3000000 * 0.15 = 450000
      expect(output.baseTax).toBe(450000);
    });
  });

  // ── Medicare Levy ────────────────────────────────────────────────────

  describe('Medicare levy', () => {
    it('below threshold — zero Medicare', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 1820000 }),
        FY2025_RULES,
      );
      expect(output.medicareLevyAmount).toBe(0);
    });

    it('in shade-in range — 10% of excess', () => {
      // $27,000 = above $26,308 threshold, within phase-in range ($26,308 + $3,288 = $29,596)
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 2700000 }),
        FY2025_RULES,
      );
      // shade-in: (2700000 - 2630800) * 0.10 = 69200 * 0.10 = 6920
      expect(output.medicareLevyAmount).toBe(6920);
    });

    it('above phase-in — full 2% rate', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 6500000 }),
        FY2025_RULES,
      );
      // 6500000 * 0.02 = 130000
      expect(output.medicareLevyAmount).toBe(130000);
    });

    it('non-resident — zero Medicare', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 10000000, residencyStatus: 'non_resident' }),
        FY2025_RULES,
      );
      expect(output.medicareLevyAmount).toBe(0);
    });
  });

  // ── Medicare Levy Surcharge ──────────────────────────────────────────

  describe('Medicare levy surcharge', () => {
    it('with PHI — no MLS even at high income', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 15000000, privateHealthInsurance: true }),
        FY2025_RULES,
      );
      expect(output.medicareLevySurcharge).toBe(0);
    });

    it('$100K without PHI — MLS at 1%', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 10000000, privateHealthInsurance: false }),
        FY2025_RULES,
      );
      // 10000000 * 0.01 = 100000
      expect(output.medicareLevySurcharge).toBe(100000);
    });

    it('$150K without PHI — MLS at 1.5%', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 15000000, privateHealthInsurance: false }),
        FY2025_RULES,
      );
      // 15000000 * 0.015 = 225000
      expect(output.medicareLevySurcharge).toBe(225000);
    });
  });

  // ── LITO ─────────────────────────────────────────────────────────────

  describe('LITO (Low Income Tax Offset)', () => {
    it('below $37,500 — full $700 offset', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 3000000 }),
        FY2025_RULES,
      );
      expect(output.litoOffset).toBe(70000);
    });

    it('in phase-out range — reduced offset', () => {
      // $50,000: LITO = 70000 - (5000000 - 3750000) * 0.05 = 70000 - 62500 = 7500
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 5000000 }),
        FY2025_RULES,
      );
      expect(output.litoOffset).toBe(7500);
    });

    it('above $66,250 — zero LITO', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 7000000 }),
        FY2025_RULES,
      );
      expect(output.litoOffset).toBe(0);
    });

    it('non-resident — zero LITO', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 3000000, residencyStatus: 'non_resident' }),
        FY2025_RULES,
      );
      expect(output.litoOffset).toBe(0);
    });
  });

  // ── SAPTO ────────────────────────────────────────────────────────────

  describe('SAPTO (Senior Australians Tax Offset)', () => {
    it('eligible senior below threshold — full offset', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 3200000, isEligibleSenior: true }),
        FY2025_RULES,
      );
      expect(output.saptoOffset).toBe(244600);
    });

    it('eligible senior above threshold — reduced offset', () => {
      // $40,000: SAPTO = 244600 - (4000000 - 3290000) * 0.125 = 244600 - 88750 = 155850
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 4000000, isEligibleSenior: true }),
        FY2025_RULES,
      );
      expect(output.saptoOffset).toBe(155850);
    });

    it('non-eligible — zero SAPTO', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 3200000, isEligibleSenior: false }),
        FY2025_RULES,
      );
      expect(output.saptoOffset).toBe(0);
    });
  });

  // ── HECS-HELP ────────────────────────────────────────────────────────

  describe('HECS-HELP repayment', () => {
    it('no HECS debt — zero repayment', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 10000000, hasHecsDebt: false }),
        FY2025_RULES,
      );
      expect(output.hecsRepayment).toBe(0);
    });

    it('below minimum threshold — zero repayment', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 5000000, hasHecsDebt: true }),
        FY2025_RULES,
      );
      expect(output.hecsRepayment).toBe(0);
    });

    it('$54,880 — minimum 1% repayment', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 5488000, hasHecsDebt: true }),
        FY2025_RULES,
      );
      // 5488000 * 0.01 = 54880
      expect(output.hecsRepayment).toBe(54880);
    });

    it('HECS is separate from totalTaxPayable', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 6000000, hasHecsDebt: true }),
        FY2025_RULES,
      );
      // HECS should be in repayment, not in totalTaxPayable
      expect(output.hecsRepayment).toBeGreaterThan(0);
      // totalTaxPayable should NOT include HECS
      const noHecs = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 6000000, hasHecsDebt: false }),
        FY2025_RULES,
      );
      expect(output.totalTaxPayable).toBe(noHecs.totalTaxPayable);
    });
  });

  // ── CGT ──────────────────────────────────────────────────────────────

  describe('Capital Gains Tax', () => {
    it('resident long-term — 50% discount', () => {
      const output = calculateTaxEstimate(
        makeInput({ capitalGains: { shortTerm: 0, longTerm: 2000000 } }),
        FY2025_RULES,
      );
      // 2000000 * (1 - 0.50) = 1000000
      expect(output.grossIncome).toBe(1000000);
    });

    it('short-term gains — no discount', () => {
      const output = calculateTaxEstimate(
        makeInput({ capitalGains: { shortTerm: 2000000, longTerm: 0 } }),
        FY2025_RULES,
      );
      expect(output.grossIncome).toBe(2000000);
    });

    it('non-resident — no CGT discount', () => {
      const output = calculateTaxEstimate(
        makeInput({
          capitalGains: { shortTerm: 0, longTerm: 2000000 },
          residencyStatus: 'non_resident',
        }),
        FY2025_RULES,
      );
      // Full 2000000 included
      expect(output.grossIncome).toBe(2000000);
    });
  });

  // ── Negative Gearing ─────────────────────────────────────────────────

  describe('Negative gearing', () => {
    it('rental loss reduces taxable income', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 8000000, rentalIncome: -1000000 }),
        FY2025_RULES,
      );
      expect(output.taxableIncome).toBe(7000000);
    });

    it('generates a negative gearing warning', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 8000000, rentalIncome: -500000 }),
        FY2025_RULES,
      );
      expect(output.warnings.some((w) => w.includes('negative gearing'))).toBe(true);
    });
  });

  // ── Franking Credits ─────────────────────────────────────────────────

  describe('Franking credits', () => {
    it('excess franking credits refunded', () => {
      const output = calculateTaxEstimate(
        makeInput({
          grossEmploymentIncome: 1000000, // $10K
          dividendFrankingCredits: 500000, // $5K franking
          taxWithheld: 0,
        }),
        FY2025_RULES,
      );
      expect(output.totalTaxPayable).toBe(0);
      expect(output.estimatedRefundOrOwing).toBeGreaterThan(0);
    });
  });

  // ── Tax Floor ────────────────────────────────────────────────────────

  describe('Tax floor (TAX-INV-04)', () => {
    it('totalTaxPayable never goes negative', () => {
      const output = calculateTaxEstimate(
        makeInput({
          grossEmploymentIncome: 500000, // very low income
          dividendFrankingCredits: 1000000, // large franking credits
        }),
        FY2025_RULES,
      );
      expect(output.totalTaxPayable).toBe(0);
      expect(output.totalTaxPayable).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Mandatory Output Fields ──────────────────────────────────────────

  describe('Mandatory output fields (TAX-INV-05)', () => {
    it('always includes disclaimer', () => {
      const output = calculateTaxEstimate(makeInput(), FY2025_RULES);
      expect(output.disclaimer).toBeDefined();
      expect(output.disclaimer.length).toBeGreaterThan(0);
      expect(output.disclaimer.toLowerCase()).toContain('estimate');
    });

    it('includes rulesSnapshotId and rulesVersion', () => {
      const output = calculateTaxEstimate(makeInput(), FY2025_RULES);
      expect(output.rulesSnapshotId).toBe('test-snapshot-001');
      expect(output.rulesVersion).toBe(1);
    });

    it('includes calculatedAt date', () => {
      const output = calculateTaxEstimate(makeInput(), FY2025_RULES);
      expect(output.calculatedAt).toBeInstanceOf(Date);
    });

    it('includes breakdown array', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 6500000 }),
        FY2025_RULES,
      );
      expect(Array.isArray(output.breakdown)).toBe(true);
      expect(output.breakdown.length).toBeGreaterThan(0);
    });

    it('includes warnings array', () => {
      const output = calculateTaxEstimate(makeInput(), FY2025_RULES);
      expect(Array.isArray(output.warnings)).toBe(true);
    });
  });

  // ── Reproducibility ──────────────────────────────────────────────────

  describe('Reproducibility (TAX-INV-02)', () => {
    it('same input + rules = identical output (excluding calculatedAt)', () => {
      const input = makeInput({
        grossEmploymentIncome: 8500000,
        rentalIncome: -200000,
        dividendIncome: 50000,
        dividendFrankingCredits: 21429,
        hasHecsDebt: true,
        taxWithheld: 2000000,
      });

      const output1 = calculateTaxEstimate(input, FY2025_RULES);
      const output2 = calculateTaxEstimate(input, FY2025_RULES);

      expect(output1.grossIncome).toBe(output2.grossIncome);
      expect(output1.taxableIncome).toBe(output2.taxableIncome);
      expect(output1.baseTax).toBe(output2.baseTax);
      expect(output1.totalTaxPayable).toBe(output2.totalTaxPayable);
      expect(output1.estimatedRefundOrOwing).toBe(output2.estimatedRefundOrOwing);
      expect(output1.medicareLevyAmount).toBe(output2.medicareLevyAmount);
      expect(output1.litoOffset).toBe(output2.litoOffset);
      expect(output1.hecsRepayment).toBe(output2.hecsRepayment);
    });
  });

  // ── Effective & Marginal Rates ───────────────────────────────────────

  describe('Tax rates', () => {
    it('effective rate is a percentage of gross income', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 10000000 }),
        FY2025_RULES,
      );
      expect(output.effectiveTaxRate).toBeGreaterThan(0);
      expect(output.effectiveTaxRate).toBeLessThan(50);
    });

    it('marginal rate matches bracket', () => {
      const output = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 6500000 }), // $65K = 30% bracket
        FY2025_RULES,
      );
      expect(output.marginalTaxRate).toBe(30);
    });

    it('zero income = zero rates', () => {
      const output = calculateTaxEstimate(makeInput(), FY2025_RULES);
      expect(output.effectiveTaxRate).toBe(0);
      expect(output.marginalTaxRate).toBe(0);
    });
  });

  // ── Refund / Owing ───────────────────────────────────────────────────

  describe('Refund/owing calculation', () => {
    it('positive = refund when withheld > payable', () => {
      const output = calculateTaxEstimate(
        makeInput({
          grossEmploymentIncome: 6500000,
          taxWithheld: 2000000, // over-withheld
        }),
        FY2025_RULES,
      );
      expect(output.estimatedRefundOrOwing).toBeGreaterThan(0);
    });

    it('negative = owing when withheld < payable', () => {
      const output = calculateTaxEstimate(
        makeInput({
          grossEmploymentIncome: 10000000,
          taxWithheld: 100000, // under-withheld
        }),
        FY2025_RULES,
      );
      expect(output.estimatedRefundOrOwing).toBeLessThan(0);
    });
  });

  // ── Deductions ───────────────────────────────────────────────────────

  describe('Deductions', () => {
    it('reduce taxable income', () => {
      const noDeductions = calculateTaxEstimate(
        makeInput({ grossEmploymentIncome: 8000000 }),
        FY2025_RULES,
      );
      const withDeductions = calculateTaxEstimate(
        makeInput({
          grossEmploymentIncome: 8000000,
          deductions: {
            workRelated: 100000,
            selfEducation: 0,
            vehicleExpenses: 0,
            homeOffice: 0,
            donations: 0,
            incomeProtection: 0,
            accountingFees: 0,
            other: 0,
          },
        }),
        FY2025_RULES,
      );
      expect(withDeductions.taxableIncome).toBe(noDeductions.taxableIncome - 100000);
    });

    it('standard deduction warning for small work-related only', () => {
      const output = calculateTaxEstimate(
        makeInput({
          grossEmploymentIncome: 5000000,
          deductions: {
            workRelated: 25000,
            selfEducation: 0,
            vehicleExpenses: 0,
            homeOffice: 0,
            donations: 0,
            incomeProtection: 0,
            accountingFees: 0,
            other: 0,
          },
        }),
        FY2025_RULES,
      );
      expect(output.warnings.some((w) => w.toLowerCase().includes('standard deduction'))).toBe(
        true,
      );
    });
  });
});
