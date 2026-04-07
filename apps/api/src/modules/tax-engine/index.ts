// ─── Tax Engine Module — Public API ────────────────────────────────────────

// Models
export { createTaxRuleConfigModelV2 } from './taxRuleConfig.model';
export { createTaxEstimateLogModel } from './taxEstimateLog.model';
export { createTaxReturnResultModel } from './taxReturnResult.model';

// Pure calculator (zero side effects)
export { calculateTaxEstimate } from './taxCalculator';

// Test suite (VER-INV-02)
export { runTaxRuleTestSuite } from './taxRuleTestSuite';

// Service
export { createTaxEngineService } from './taxEngine.service';
export type { TaxEngineServiceDeps, TaxEngineServiceResult } from './taxEngine.service';

// Routes
export { createTaxEngineRoutes } from './taxEngine.routes';
export type { TaxEngineRouteDeps } from './taxEngine.routes';

// Types (re-export all)
export type {
  TaxBracket,
  MedicareLevyConfig,
  MedicareLevySurchargeTier,
  HecsHelpTier,
  LitoConfig,
  SaptoConfig,
  ITaxRuleConfig,
  ITaxRuleConfigDocument,
  TaxEstimateInput,
  TaxEstimateOutput,
  BreakdownItem,
  ITaxEstimateLog,
  ITaxEstimateLogDocument,
  ITaxReturnResult,
  ITaxReturnResultDocument,
  TaxRuleTestResult,
  PaginationMeta,
  EstimateContext,
  TaxRuleStatus,
  ResidencyStatus,
} from './taxEngine.types';

export {
  RESIDENCY_STATUSES,
  ESTIMATE_CONTEXTS,
  TAX_RESULT_SOURCES,
  RETURN_TYPES,
  LODGEMENT_METHODS,
  ATO_AMENDMENT_STATUSES,
} from './taxEngine.types';
