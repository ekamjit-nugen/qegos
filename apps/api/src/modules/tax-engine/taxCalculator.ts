/**
 * TAX-INV-02: Pure function. ZERO side effects. ZERO database reads.
 * TAX-INV-03: ALL arithmetic uses integer cents. No floating point.
 * TAX-INV-01: All logic reads from the rules parameter, nothing hardcoded.
 *
 * Given the same input + rules, output is ALWAYS identical (reproducibility guarantee).
 */

import type {
  TaxEstimateInput,
  TaxEstimateOutput,
  BreakdownItem,
  ITaxRuleConfig,
  TaxBracket,
} from './taxEngine.types';

const DISCLAIMER =
  'This is an estimate only, not a tax return. Your actual refund or amount owing may differ. Consult your registered tax agent for an accurate assessment.';

// ─── Bracket Lookup ────────────────────────────────────────────────────────

function findBracket(brackets: TaxBracket[], taxableIncome: number): TaxBracket | undefined {
  for (const bracket of brackets) {
    if (taxableIncome >= bracket.min && (bracket.max === null || taxableIncome <= bracket.max)) {
      return bracket;
    }
  }
  return undefined;
}

function calculateBaseTax(brackets: TaxBracket[], taxableIncome: number): number {
  if (taxableIncome <= 0) {
    return 0;
  }
  const bracket = findBracket(brackets, taxableIncome);
  if (!bracket) {
    return 0;
  }
  return bracket.baseTax + Math.round((taxableIncome - bracket.min) * bracket.rate);
}

// ─── Main Pure Function ────────────────────────────────────────────────────

export function calculateTaxEstimate(
  input: TaxEstimateInput,
  rules: ITaxRuleConfig,
): TaxEstimateOutput {
  const warnings: string[] = [];
  const breakdown: BreakdownItem[] = [];
  const isResident = input.residencyStatus === 'resident';
  const isNonResident = input.residencyStatus === 'non_resident';
  const isWorkingHoliday = input.residencyStatus === 'working_holiday';

  // ── STEP 1: GROSS INCOME ─────────────────────────────────────────────────

  // CGT calculation (TAX-INV-08)
  let capitalGainsCalculated = input.capitalGains.shortTerm;
  if (isResident) {
    // 50% discount for residents on long-term gains
    capitalGainsCalculated += Math.round(input.capitalGains.longTerm * (1 - rules.cgtDiscount));
  } else {
    // Non-residents and WHM: no discount
    capitalGainsCalculated += input.capitalGains.longTerm;
  }

  if (input.capitalGains.longTerm > 0 && isResident) {
    const discountAmount =
      input.capitalGains.longTerm -
      Math.round(input.capitalGains.longTerm * (1 - rules.cgtDiscount));
    warnings.push(
      `CGT 50% discount applied: $${(discountAmount / 100).toFixed(2)} excluded from long-term gains`,
    );
  }

  const grossIncome =
    input.grossEmploymentIncome +
    input.businessIncome +
    input.rentalIncome + // CAN BE NEGATIVE (negative gearing)
    input.interestIncome +
    input.dividendIncome +
    input.dividendFrankingCredits +
    capitalGainsCalculated +
    input.foreignIncome +
    input.governmentPayments +
    input.superannuationIncome;

  if (input.rentalIncome < 0) {
    warnings.push(
      `Rental loss of $${(Math.abs(input.rentalIncome) / 100).toFixed(2)} applied (negative gearing)`,
    );
  }

  breakdown.push({
    label: 'Employment Income',
    amount: input.grossEmploymentIncome,
    type: 'income',
  });
  if (input.businessIncome > 0) {
    breakdown.push({ label: 'Business Income', amount: input.businessIncome, type: 'income' });
  }
  if (input.rentalIncome !== 0) {
    breakdown.push({ label: 'Rental Income', amount: input.rentalIncome, type: 'income' });
  }
  if (input.interestIncome > 0) {
    breakdown.push({ label: 'Interest Income', amount: input.interestIncome, type: 'income' });
  }
  if (input.dividendIncome > 0) {
    breakdown.push({ label: 'Dividend Income', amount: input.dividendIncome, type: 'income' });
  }
  if (input.dividendFrankingCredits > 0) {
    breakdown.push({
      label: 'Franking Credits',
      amount: input.dividendFrankingCredits,
      type: 'income',
    });
  }
  if (capitalGainsCalculated > 0) {
    breakdown.push({
      label: 'Capital Gains (after discount)',
      amount: capitalGainsCalculated,
      type: 'income',
    });
  }
  if (input.foreignIncome > 0) {
    breakdown.push({ label: 'Foreign Income', amount: input.foreignIncome, type: 'income' });
  }
  if (input.governmentPayments > 0) {
    breakdown.push({
      label: 'Government Payments',
      amount: input.governmentPayments,
      type: 'income',
    });
  }
  if (input.superannuationIncome > 0) {
    breakdown.push({
      label: 'Superannuation Income',
      amount: input.superannuationIncome,
      type: 'income',
    });
  }

  // ── STEP 2: DEDUCTIONS ───────────────────────────────────────────────────

  const d = input.deductions;
  let totalDeductions =
    d.workRelated +
    d.selfEducation +
    d.vehicleExpenses +
    d.homeOffice +
    d.donations +
    d.incomeProtection +
    d.accountingFees +
    d.other;

  // Standard deduction shortcut: $300 work-related only
  const nonWorkDeductions =
    d.selfEducation +
    d.vehicleExpenses +
    d.homeOffice +
    d.donations +
    d.incomeProtection +
    d.accountingFees +
    d.other;
  if (totalDeductions <= 30000 && nonWorkDeductions === 0 && d.workRelated > 0) {
    warnings.push('Using $300 standard deduction for work-related expenses');
  }

  // Donations capped at taxable income (pre-deduction gross)
  const maxDonations = Math.max(0, grossIncome);
  if (d.donations > maxDonations) {
    const excess = d.donations - maxDonations;
    totalDeductions -= excess;
    warnings.push(`Donations capped: $${(excess / 100).toFixed(2)} exceeds assessable income`);
  }

  breakdown.push({ label: 'Total Deductions', amount: totalDeductions, type: 'deduction' });

  // ── STEP 3: TAXABLE INCOME ───────────────────────────────────────────────

  const taxableIncome = Math.max(0, grossIncome - totalDeductions);

  // ── STEP 4: BASE TAX ────────────────────────────────────────────────────

  let selectedBrackets: TaxBracket[];
  if (isNonResident) {
    selectedBrackets = rules.nonResidentBrackets;
  } else if (isWorkingHoliday) {
    selectedBrackets = rules.workingHolidayBrackets;
  } else {
    selectedBrackets = rules.brackets;
  }

  const baseTax = calculateBaseTax(selectedBrackets, taxableIncome);
  const currentBracket = findBracket(selectedBrackets, taxableIncome);

  breakdown.push({ label: 'Base Tax', amount: baseTax, type: 'tax' });

  // ── STEP 5: MEDICARE LEVY (residents only — TAX-INV-06) ──────────────────

  let medicareLevyAmount = 0;
  if (isResident) {
    const ml = rules.medicareLevy;
    const seniorThreshold = rules.medicareLevySeniorSingleThreshold;
    const effectiveThreshold =
      input.isEligibleSenior && seniorThreshold > 0 ? seniorThreshold : ml.lowIncomeThreshold;

    if (taxableIncome <= effectiveThreshold) {
      medicareLevyAmount = 0;
    } else if (taxableIncome <= effectiveThreshold + ml.phaseInRange) {
      // Shade-in: 10% of amount above threshold
      medicareLevyAmount = Math.round((taxableIncome - effectiveThreshold) * 0.1);
    } else {
      medicareLevyAmount = Math.round(taxableIncome * ml.rate);
    }

    // Family reduction
    if (input.spouseIncome !== undefined || input.numberOfDependants > 0) {
      const familyThreshold =
        ml.familyThreshold + input.numberOfDependants * ml.additionalChildAmount;
      const combinedIncome = taxableIncome + (input.spouseIncome ?? 0);
      if (combinedIncome <= familyThreshold) {
        // Reduced or nil levy for low-income family
        const familyLevy = Math.round((combinedIncome - familyThreshold) * 0.1);
        medicareLevyAmount = Math.max(0, Math.min(medicareLevyAmount, familyLevy));
      }
    }
  }

  if (medicareLevyAmount > 0) {
    breakdown.push({ label: 'Medicare Levy', amount: medicareLevyAmount, type: 'levy' });
  }

  // ── STEP 6: MEDICARE LEVY SURCHARGE (residents without PHI) ──────────────

  let medicareLevySurcharge = 0;
  if (isResident && !input.privateHealthInsurance && rules.medicareLevySurchargeTiers.length > 0) {
    for (const tier of rules.medicareLevySurchargeTiers) {
      if (taxableIncome >= tier.min && (tier.max === null || taxableIncome <= tier.max)) {
        medicareLevySurcharge = Math.round(taxableIncome * tier.rate);
        warnings.push(
          `Medicare Levy Surcharge of ${(tier.rate * 100).toFixed(1)}% applies — consider private health insurance`,
        );
        break;
      }
    }
  }

  if (medicareLevySurcharge > 0) {
    breakdown.push({
      label: 'Medicare Levy Surcharge',
      amount: medicareLevySurcharge,
      type: 'levy',
    });
  }

  // ── STEP 7: LITO (residents only — TAX-INV-06) ──────────────────────────

  let litoOffset = 0;
  if (isResident) {
    const lito = rules.lito;
    if (taxableIncome <= lito.lowerThreshold) {
      litoOffset = lito.maxOffset;
    } else if (taxableIncome < lito.upperThreshold) {
      litoOffset =
        lito.maxOffset - Math.round((taxableIncome - lito.lowerThreshold) * lito.reductionRate);
      litoOffset = Math.max(0, litoOffset);
    }
    // Above upperThreshold: 0
  }

  if (litoOffset > 0) {
    breakdown.push({ label: 'Low Income Tax Offset (LITO)', amount: litoOffset, type: 'offset' });
  }

  // ── STEP 8: SAPTO (eligible seniors, residents only) ─────────────────────

  let saptoOffset = 0;
  if (isResident && input.isEligibleSenior && rules.sapto) {
    const sapto = rules.sapto;
    if (taxableIncome <= sapto.thresholdSingle) {
      saptoOffset = sapto.maxSingle;
    } else {
      // Phase-out: reduce by rate per dollar over threshold
      saptoOffset =
        sapto.maxSingle - Math.round((taxableIncome - sapto.thresholdSingle) * sapto.phaseOutRate);
      saptoOffset = Math.max(0, saptoOffset);
    }
  }

  if (saptoOffset > 0) {
    breakdown.push({
      label: 'Senior Australians Tax Offset (SAPTO)',
      amount: saptoOffset,
      type: 'offset',
    });
  }

  // ── STEP 9: HECS-HELP REPAYMENT (TAX-INV-07) ───────────────────────────

  let hecsRepayment = 0;
  if (input.hasHecsDebt && rules.hecsHelp.length > 0) {
    for (const tier of rules.hecsHelp) {
      if (taxableIncome >= tier.min && (tier.max === null || taxableIncome <= tier.max)) {
        hecsRepayment = Math.round(taxableIncome * tier.rate);
        warnings.push(
          `HECS-HELP compulsory repayment of $${(hecsRepayment / 100).toFixed(2)} at ${(tier.rate * 100).toFixed(1)}%`,
        );
        break;
      }
    }
  }

  if (hecsRepayment > 0) {
    breakdown.push({ label: 'HECS-HELP Repayment', amount: hecsRepayment, type: 'repayment' });
  }

  // ── STEP 10: TOTAL TAX PAYABLE ──────────────────────────────────────────

  let totalTaxPayable =
    baseTax +
    medicareLevyAmount +
    medicareLevySurcharge -
    litoOffset -
    saptoOffset -
    input.dividendFrankingCredits;

  // TAX-INV-04: Tax payable can NEVER be negative. Floor at 0.
  // Excess credits (e.g., franking) contribute to refund separately.
  const excessCredits = totalTaxPayable < 0 ? Math.abs(totalTaxPayable) : 0;
  totalTaxPayable = Math.max(0, totalTaxPayable);

  // Total including HECS (HECS is ADDITIONAL, not in "tax payable")
  const totalWithHecs = totalTaxPayable + hecsRepayment;

  breakdown.push({ label: 'Total Tax Payable', amount: totalTaxPayable, type: 'tax' });

  // ── STEP 11: REFUND OR OWING ────────────────────────────────────────────

  const totalTaxWithheld = input.taxWithheld;
  // Positive = refund, negative = owing
  let estimatedRefundOrOwing = totalTaxWithheld - totalWithHecs;

  // Handle excess franking credits (refundable)
  if (excessCredits > 0) {
    estimatedRefundOrOwing += excessCredits;
    warnings.push(`Excess franking credits of $${(excessCredits / 100).toFixed(2)} refunded`);
  }

  breakdown.push({ label: 'Tax Withheld', amount: totalTaxWithheld, type: 'tax' });
  breakdown.push({
    label: estimatedRefundOrOwing >= 0 ? 'Estimated Refund' : 'Estimated Amount Owing',
    amount: estimatedRefundOrOwing,
    type: 'tax',
  });

  // ── STEP 12: RATES ──────────────────────────────────────────────────────

  const effectiveTaxRate =
    grossIncome > 0 ? Math.round((totalTaxPayable / grossIncome) * 10000) / 100 : 0;
  const marginalTaxRate = currentBracket ? currentBracket.rate * 100 : 0;

  // ── TAX-INV-05: Mandatory output fields ──────────────────────────────────

  return {
    grossIncome,
    totalDeductions,
    taxableIncome,
    baseTax,
    medicareLevyAmount,
    medicareLevySurcharge,
    litoOffset,
    saptoOffset,
    hecsRepayment,
    totalTaxPayable,
    totalTaxWithheld,
    estimatedRefundOrOwing,
    effectiveTaxRate,
    marginalTaxRate,
    breakdown,
    warnings,
    disclaimer: DISCLAIMER,
    calculatedAt: new Date(),
    rulesSnapshotId: rules.snapshotId,
    rulesVersion: rules.version,
  };
}
