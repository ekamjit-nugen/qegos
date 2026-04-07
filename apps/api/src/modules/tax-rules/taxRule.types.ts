import type { Document, Types } from 'mongoose';

export interface TaxBracket {
  min: number; // cents
  max: number | null; // cents, null = unlimited
  rate: number; // decimal, e.g. 0.19 for 19%
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

export interface ITaxRuleConfig {
  name: string;
  financialYear: string; // e.g. "2024-25"
  effectiveFrom: Date;
  effectiveTo: Date;
  status: 'draft' | 'active' | 'archived';
  brackets: TaxBracket[];
  medicareLevy: MedicareLevyConfig;
  hecsHelp: HecsHelpTier[];
  lito: LitoConfig;
  lmito?: LmitoConfig;
  seniorOffset?: SeniorOffsetConfig;
  superannuationRate: number; // decimal
  gstRate: number; // decimal
  usageCount: number;
  createdBy: Types.ObjectId;
  isFrozen: boolean;
}

export interface ITaxRuleConfigDocument extends ITaxRuleConfig, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
