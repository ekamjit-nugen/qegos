/**
 * Built-in tax rules test suite (VER-INV-02).
 * ALL 12 test cases must pass before rule activation.
 */

import { calculateTaxEstimate } from './taxCalculator';
import type { TaxEstimateInput, TaxRuleTestResult, ITaxRuleConfig } from './taxEngine.types';

function makeInput(rules: ITaxRuleConfig, overrides: Partial<TaxEstimateInput>): TaxEstimateInput {
  const base: TaxEstimateInput = {
    financialYear: rules.financialYear,
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

export function runTaxRuleTestSuite(rules: ITaxRuleConfig): TaxRuleTestResult[] {
  const results: TaxRuleTestResult[] = [];

  // ── Test 1: Zero income ──────────────────────────────────────────────────
  {
    const input = makeInput(rules, {});
    const output = calculateTaxEstimate(input, rules);
    results.push({
      name: 'Zero income — tax and refund should be zero',
      passed: output.baseTax === 0 && output.totalTaxPayable === 0,
      expected: { baseTax: 0, totalTaxPayable: 0 },
      actual: { baseTax: output.baseTax, totalTaxPayable: output.totalTaxPayable },
    });
  }

  // ── Test 2: Below tax-free threshold ($18,200) ───────────────────────────
  {
    const input = makeInput(rules, { grossEmploymentIncome: 1820000 });
    const output = calculateTaxEstimate(input, rules);
    results.push({
      name: 'Below tax-free threshold ($18,200) — zero tax, zero Medicare',
      passed: output.baseTax === 0 && output.medicareLevyAmount === 0,
      expected: { baseTax: 0, medicareLevyAmount: 0 },
      actual: { baseTax: output.baseTax, medicareLevyAmount: output.medicareLevyAmount },
    });
  }

  // ── Test 3: Just above threshold ($18,201) ───────────────────────────────
  {
    const input = makeInput(rules, { grossEmploymentIncome: 1820100 });
    const output = calculateTaxEstimate(input, rules);
    // $18,201 falls in 16% bracket — compute dynamically from rules
    const aboveBracket = rules.brackets.find(
      (b) => 1820100 >= b.min && (b.max === null || 1820100 <= b.max),
    );
    const expectedBaseTax = aboveBracket
      ? aboveBracket.baseTax + Math.round((1820100 - aboveBracket.min) * aboveBracket.rate)
      : 0;
    results.push({
      name: 'Just above threshold ($18,201) — minimal tax applies',
      passed: output.baseTax === expectedBaseTax,
      expected: expectedBaseTax,
      actual: output.baseTax,
      details: `Expected baseTax=${expectedBaseTax}, got ${output.baseTax}`,
    });
  }

  // ── Test 4: Median income ($65,000) ──────────────────────────────────────
  {
    const input = makeInput(rules, { grossEmploymentIncome: 6500000 });
    const output = calculateTaxEstimate(input, rules);
    // $65,000 in 30% bracket: baseTax from bracket + Math.round((6500000 - 4500000) * 0.30)
    // Need to find the bracket's baseTax value from the rules
    const bracket = rules.brackets.find(
      (b) => 6500000 >= b.min && (b.max === null || 6500000 <= b.max),
    );
    const expectedBaseTax = bracket
      ? bracket.baseTax + Math.round((6500000 - bracket.min) * bracket.rate)
      : 0;
    results.push({
      name: 'Median income ($65,000) — correct bracket calculation',
      passed: output.baseTax === expectedBaseTax,
      expected: expectedBaseTax,
      actual: output.baseTax,
      details: `Expected baseTax=${expectedBaseTax}, got ${output.baseTax}`,
    });
  }

  // ── Test 5: High income no PHI ($100,000) — MLS applied ─────────────────
  {
    const input = makeInput(rules, {
      grossEmploymentIncome: 10000000,
      privateHealthInsurance: false,
    });
    const output = calculateTaxEstimate(input, rules);
    results.push({
      name: 'High income ($100K) without PHI — Medicare Levy Surcharge applied',
      passed: output.medicareLevySurcharge > 0,
      expected: 'medicareLevySurcharge > 0',
      actual: output.medicareLevySurcharge,
      details: `MLS = ${output.medicareLevySurcharge} cents`,
    });
  }

  // ── Test 6: Senior low income ($32,000) — SAPTO applied ─────────────────
  {
    const input = makeInput(rules, {
      grossEmploymentIncome: 3200000,
      isEligibleSenior: true,
    });
    const output = calculateTaxEstimate(input, rules);
    results.push({
      name: 'Senior low income ($32,000) — SAPTO offset applied',
      passed: output.saptoOffset > 0,
      expected: 'saptoOffset > 0',
      actual: output.saptoOffset,
      details: `SAPTO = ${output.saptoOffset} cents`,
    });
  }

  // ── Test 7: Non-resident ($50,000) ───────────────────────────────────────
  {
    const input = makeInput(rules, {
      grossEmploymentIncome: 5000000,
      residencyStatus: 'non_resident',
    });
    const output = calculateTaxEstimate(input, rules);
    // Non-resident: 30% from $0, no LITO, no Medicare
    const nrBracket = rules.nonResidentBrackets.find(
      (b) => 5000000 >= b.min && (b.max === null || 5000000 <= b.max),
    );
    const expectedBaseTax = nrBracket
      ? nrBracket.baseTax + Math.round((5000000 - nrBracket.min) * nrBracket.rate)
      : 0;
    results.push({
      name: 'Non-resident ($50K) — 30% flat, no LITO, no Medicare',
      passed:
        output.baseTax === expectedBaseTax &&
        output.litoOffset === 0 &&
        output.medicareLevyAmount === 0,
      expected: { baseTax: expectedBaseTax, litoOffset: 0, medicareLevyAmount: 0 },
      actual: {
        baseTax: output.baseTax,
        litoOffset: output.litoOffset,
        medicareLevyAmount: output.medicareLevyAmount,
      },
    });
  }

  // ── Test 8: Negative gearing ─────────────────────────────────────────────
  {
    const input = makeInput(rules, {
      grossEmploymentIncome: 8000000,
      rentalIncome: -1000000,
    });
    const output = calculateTaxEstimate(input, rules);
    results.push({
      name: 'Negative gearing ($80K employ, -$10K rental) — taxable income = $70K',
      passed: output.taxableIncome === 7000000,
      expected: 7000000,
      actual: output.taxableIncome,
    });
  }

  // ── Test 9: CGT with 50% discount ───────────────────────────────────────
  {
    const input = makeInput(rules, {
      capitalGains: { shortTerm: 0, longTerm: 2000000 },
    });
    const output = calculateTaxEstimate(input, rules);
    // Resident: 50% discount → 1000000 included in gross
    const expectedGross = Math.round(2000000 * (1 - rules.cgtDiscount));
    results.push({
      name: 'CGT 50% discount (resident, $20K long-term) — $10K included',
      passed: output.grossIncome === expectedGross,
      expected: expectedGross,
      actual: output.grossIncome,
    });
  }

  // ── Test 10: HECS minimum tier ───────────────────────────────────────────
  {
    const input = makeInput(rules, {
      grossEmploymentIncome: 5488000,
      hasHecsDebt: true,
    });
    const output = calculateTaxEstimate(input, rules);
    const hecsTier = rules.hecsHelp.find(
      (t) => 5488000 >= t.min && (t.max === null || 5488000 <= t.max),
    );
    const expectedHecs = hecsTier ? Math.round(5488000 * hecsTier.rate) : 0;
    results.push({
      name: 'HECS minimum tier ($54,880) — 1% compulsory repayment',
      passed: output.hecsRepayment === expectedHecs,
      expected: expectedHecs,
      actual: output.hecsRepayment,
      details: `Rate: ${hecsTier?.rate ?? 'none'}, repayment: ${output.hecsRepayment}`,
    });
  }

  // ── Test 11: Franking credit excess (refundable) ─────────────────────────
  {
    const input = makeInput(rules, {
      grossEmploymentIncome: 1000000,
      dividendFrankingCredits: 500000,
      taxWithheld: 0,
    });
    const output = calculateTaxEstimate(input, rules);
    results.push({
      name: 'Franking credit excess ($10K income, $5K franking) — excess refunded',
      passed: output.totalTaxPayable === 0 && output.estimatedRefundOrOwing > 0,
      expected: { totalTaxPayable: 0, refundPositive: true },
      actual: {
        totalTaxPayable: output.totalTaxPayable,
        estimatedRefundOrOwing: output.estimatedRefundOrOwing,
      },
      details: `Tax payable floored at 0, excess ${output.estimatedRefundOrOwing} cents refunded`,
    });
  }

  // ── Test 12: Standard deduction warning ──────────────────────────────────
  {
    const input = makeInput(rules, {
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
    });
    const output = calculateTaxEstimate(input, rules);
    const hasStdDeductionWarning = output.warnings.some((w) =>
      w.toLowerCase().includes('standard deduction'),
    );
    results.push({
      name: 'Standard deduction ($250 work-related only) — warning shown',
      passed: hasStdDeductionWarning,
      expected: 'warnings contains "standard deduction"',
      actual: output.warnings,
    });
  }

  return results;
}
