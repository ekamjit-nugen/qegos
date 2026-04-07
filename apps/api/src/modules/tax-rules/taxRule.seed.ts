import type { Model, Types } from 'mongoose';
import type { ITaxRuleConfigDocument } from './taxRule.types';

/**
 * Seed FY2024-25 Australian tax brackets (Stage 3 tax cuts).
 * All monetary values in cents.
 */
export async function seedTaxRules(
  TaxRuleConfigModel: Model<ITaxRuleConfigDocument>,
  createdBy: Types.ObjectId | string,
): Promise<void> {
  const existing = await TaxRuleConfigModel.findOne({ financialYear: '2024-25' });
  if (existing) {
    return; // Already seeded
  }

  await TaxRuleConfigModel.create({
    name: 'FY2024-25 Australian Tax Brackets (Stage 3)',
    financialYear: '2024-25',
    effectiveFrom: new Date('2024-07-01'),
    effectiveTo: new Date('2025-06-30'),
    status: 'active',
    brackets: [
      { min: 0, max: 1820000, rate: 0, baseTax: 0 },             // $0 - $18,200: nil
      { min: 1820000, max: 4500000, rate: 0.16, baseTax: 0 },    // $18,201 - $45,000: 16%
      { min: 4500000, max: 13500000, rate: 0.30, baseTax: 428800 }, // $45,001 - $135,000: 30%
      { min: 13500000, max: 19000000, rate: 0.37, baseTax: 3128800 }, // $135,001 - $190,000: 37%
      { min: 19000000, max: null, rate: 0.45, baseTax: 5163800 }, // $190,001+: 45%
    ],
    medicareLevy: {
      rate: 0.02,
      surchargeRate: 0.015,
      lowIncomeThreshold: 2630800, // $26,308
      phaseInRange: 328800, // $3,288
      familyThreshold: 4432500, // $44,325
      additionalChildAmount: 407200, // $4,072
    },
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
      maxOffset: 70000, // $700
      lowerThreshold: 3750000, // $37,500
      upperThreshold: 6625000, // $66,250
      reductionRate: 0.05, // 5 cents per dollar over lower threshold
    },
    superannuationRate: 0.115, // 11.5% for FY2024-25
    gstRate: 0.10,
    usageCount: 0,
    createdBy,
    isFrozen: false,
  });
}
