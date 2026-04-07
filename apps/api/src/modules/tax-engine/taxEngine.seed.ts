import type { Model, Types } from 'mongoose';
import type { ITaxRuleConfigDocument } from './taxEngine.types';

/**
 * Seed FY2024-25 Australian tax rules with ALL Phase 4 fields.
 * Includes: resident brackets, non-resident brackets, WHM brackets,
 * Medicare Levy, MLS tiers, HECS-HELP, LITO, SAPTO, CGT discount.
 * All monetary values in cents.
 */
export async function seedTaxEngineRules(
  TaxRuleConfigModel: Model<ITaxRuleConfigDocument>,
  createdBy: Types.ObjectId | string,
): Promise<void> {
  // Check both old and new model to avoid duplicates
  const existing = await TaxRuleConfigModel.findOne({ financialYear: '2024-25' });
  if (existing) {
    return; // Already seeded
  }

  await TaxRuleConfigModel.create({
    name: 'FY2024-25 Australian Tax Rules (Stage 3 — Complete)',
    financialYear: '2024-25',
    effectiveFrom: new Date('2024-07-01'),
    effectiveTo: new Date('2025-06-30'),
    status: 'active',

    // ── Resident Brackets (Stage 3 tax cuts) ───────────────────────────
    brackets: [
      { min: 0, max: 1820000, rate: 0, baseTax: 0 },             // $0 - $18,200: nil
      { min: 1820000, max: 4500000, rate: 0.16, baseTax: 0 },    // $18,201 - $45,000: 16%
      { min: 4500000, max: 13500000, rate: 0.30, baseTax: 428800 }, // $45,001 - $135,000: 30%
      { min: 13500000, max: 19000000, rate: 0.37, baseTax: 3128800 }, // $135,001 - $190,000: 37%
      { min: 19000000, max: null, rate: 0.45, baseTax: 5163800 }, // $190,001+: 45%
    ],

    // ── Non-Resident Brackets ──────────────────────────────────────────
    nonResidentBrackets: [
      { min: 0, max: 13500000, rate: 0.30, baseTax: 0 },
      { min: 13500000, max: 19000000, rate: 0.37, baseTax: 4050000 },
      { min: 19000000, max: null, rate: 0.45, baseTax: 6085000 },
    ],

    // ── Working Holiday Maker Brackets ─────────────────────────────────
    workingHolidayBrackets: [
      { min: 0, max: 4500000, rate: 0.15, baseTax: 0 },
      { min: 4500000, max: 13500000, rate: 0.30, baseTax: 675000 },
      { min: 13500000, max: 19000000, rate: 0.37, baseTax: 3375000 },
      { min: 19000000, max: null, rate: 0.45, baseTax: 5410000 },
    ],

    // ── Medicare Levy ──────────────────────────────────────────────────
    medicareLevy: {
      rate: 0.02,
      surchargeRate: 0.015,
      lowIncomeThreshold: 2630800,        // $26,308
      phaseInRange: 328800,               // $3,288
      familyThreshold: 4432500,           // $44,325
      additionalChildAmount: 407200,      // $4,072
    },

    // ── Medicare Levy Surcharge Tiers (no PHI) ─────────────────────────
    medicareLevySurchargeTiers: [
      { min: 9300000, max: 10800000, rate: 0.01 },   // $93K-$108K: 1%
      { min: 10800000, max: 14400000, rate: 0.0125 }, // $108K-$144K: 1.25%
      { min: 14400000, max: null, rate: 0.015 },      // $144K+: 1.5%
    ],

    medicareLevySeniorSingleThreshold: 3845100, // $38,451
    medicareLevyFamilyPerChild: 407200,          // $4,072

    // ── HECS-HELP Repayment Thresholds ─────────────────────────────────
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

    // ── LITO (Low Income Tax Offset) ───────────────────────────────────
    lito: {
      maxOffset: 70000,          // $700
      lowerThreshold: 3750000,   // $37,500
      upperThreshold: 6625000,   // $66,250
      reductionRate: 0.05,       // 5c per dollar over lower threshold
    },

    // ── SAPTO (Seniors and Pensioners Tax Offset) ──────────────────────
    sapto: {
      maxSingle: 244600,         // $2,446
      maxCouple: 183200,         // $1,832 (each)
      thresholdSingle: 3290000,  // $32,900
      phaseOutRate: 0.125,       // 12.5c per dollar over threshold
    },

    // ── CGT & Other ────────────────────────────────────────────────────
    cgtDiscount: 0.50,
    instantAssetWriteOff: 2000000, // $20,000
    superannuationRate: 0.115,     // 11.5% for FY2024-25
    gstRate: 0.10,

    // ── Provenance ─────────────────────────────────────────────────────
    legislationReference: 'Income Tax Rates Act 1986, Treasury Laws Amendment (Tax Cuts) 2024',
    budgetReference: '2024-25 Federal Budget — Stage 3 Tax Cuts',

    usageCount: 0,
    createdBy,
    isFrozen: false,
    changeLog: [],
  });
}
