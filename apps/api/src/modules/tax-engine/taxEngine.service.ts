import type { Model, Connection, FilterQuery } from 'mongoose';
import { AppError } from '@nugen/error-handler';
import { calculateTaxEstimate } from './taxCalculator';
import { runTaxRuleTestSuite } from './taxRuleTestSuite';
import type {
  ITaxRuleConfigDocument,
  ITaxEstimateLogDocument,
  ITaxReturnResultDocument,
  TaxEstimateInput,
  TaxEstimateOutput,
  TaxRuleTestResult,
  PaginationMeta,
  EstimateContext,
  TaxRuleStatus,
} from './taxEngine.types';
import type { ICounterDocument } from '../../database/counter.model';
import { getNextSequence } from '../../database/counter.model';

// ─── Dependencies ──────────────────────────────────────────────────────────

export interface TaxEngineServiceDeps {
  TaxRuleConfigModel: Model<ITaxRuleConfigDocument>;
  TaxEstimateLogModel: Model<ITaxEstimateLogDocument>;
  TaxReturnResultModel: Model<ITaxReturnResultDocument>;
  CounterModel: Model<ICounterDocument>;
  connection: Connection;
}

// ─── Service Interface ─────────────────────────────────────────────────────

export interface TaxEngineServiceResult {
  // Tax Rules
  createDraft: (data: Record<string, unknown>, createdBy: string) => Promise<ITaxRuleConfigDocument>;
  updateDraft: (id: string, data: Record<string, unknown>) => Promise<ITaxRuleConfigDocument>;
  activate: (id: string, performedBy: string) => Promise<{ activated: ITaxRuleConfigDocument; testResults: TaxRuleTestResult[] }>;
  correct: (snapshotId: string, corrections: Record<string, unknown>, changeReason: string, createdBy: string) => Promise<ITaxRuleConfigDocument>;
  deleteDraft: (id: string) => Promise<void>;
  getBySnapshotId: (snapshotId: string) => Promise<ITaxRuleConfigDocument>;
  getActiveForFY: (financialYear: string) => Promise<ITaxRuleConfigDocument>;
  getHistory: (financialYear: string) => Promise<ITaxRuleConfigDocument[]>;
  listRules: (query: { page?: number; limit?: number; status?: string; financialYear?: string }) => Promise<{ data: ITaxRuleConfigDocument[]; meta: PaginationMeta }>;
  validateRules: (id: string) => Promise<TaxRuleTestResult[]>;
  getRuleById: (id: string) => Promise<ITaxRuleConfigDocument>;

  // Tax Estimates
  calculateEstimate: (input: TaxEstimateInput, context: EstimateContext, userId?: string, leadId?: string, orderId?: string, performedBy?: string) => Promise<TaxEstimateOutput & { estimateNumber: string }>;
  quickEstimate: (income: number, deductions: number, residencyStatus: string) => Promise<{ estimatedRefund: { low: number; high: number }; disclaimer: string }>;
  recalculate: (input: TaxEstimateInput, snapshotId: string) => Promise<TaxEstimateOutput>;
  compare: (inputA: TaxEstimateInput, inputB: TaxEstimateInput, snapshotId?: string) => Promise<{ resultA: TaxEstimateOutput; resultB: TaxEstimateOutput; diff: Record<string, { a: number; b: number; delta: number }> }>;

  // Tax Results
  createResult: (data: Record<string, unknown>, enteredBy: string) => Promise<ITaxReturnResultDocument>;
  getResult: (orderId: string, scopeFilter?: Record<string, unknown>) => Promise<ITaxReturnResultDocument>;
  updateResult: (orderId: string, data: Record<string, unknown>, scopeFilter?: Record<string, unknown>) => Promise<ITaxReturnResultDocument>;
  verifyResult: (orderId: string, verifiedBy: string) => Promise<ITaxReturnResultDocument>;
  lockResult: (id: string, lockedBy: string) => Promise<ITaxReturnResultDocument>;
  createAmendment: (originalOrderId: string, amendmentData: Record<string, unknown>, enteredBy: string) => Promise<ITaxReturnResultDocument>;
  getAmendments: (orderId: string, scopeFilter?: Record<string, unknown>) => Promise<ITaxReturnResultDocument[]>;
  getEstimatesForOrder: (orderId: string) => Promise<ITaxEstimateLogDocument[]>;
  compareEstimateVsResult: (orderId: string) => Promise<{ estimate: ITaxEstimateLogDocument | null; result: ITaxReturnResultDocument; variance: Record<string, { estimated: number; actual: number; delta: number }> }>;
}

// ─── Factory ───────────────────────────────────────────────────────────────

export function createTaxEngineService(deps: TaxEngineServiceDeps): TaxEngineServiceResult {
  const {
    TaxRuleConfigModel, TaxEstimateLogModel, TaxReturnResultModel,
    CounterModel, connection,
  } = deps;

  // ═══ TAX RULES ═══════════════════════════════════════════════════════════

  async function createDraft(
    data: Record<string, unknown>,
    createdBy: string,
  ): Promise<ITaxRuleConfigDocument> {
    const rule = await TaxRuleConfigModel.create({
      ...data,
      status: 'draft' as TaxRuleStatus,
      usageCount: 0,
      isFrozen: false,
      createdBy,
      changeLog: [],
    });
    return rule;
  }

  async function updateDraft(
    id: string,
    data: Record<string, unknown>,
  ): Promise<ITaxRuleConfigDocument> {
    const rule = await TaxRuleConfigModel.findById(id);
    if (!rule) throw AppError.notFound('Tax rule configuration');

    if (rule.status !== 'draft') {
      throw AppError.badRequest('Only draft rules can be edited');
    }

    for (const [key, value] of Object.entries(data)) {
      if (key !== '_id' && key !== 'snapshotId' && key !== 'createdBy') {
        rule.set(key, value);
      }
    }

    await rule.save(); // Pre-save hook enforces immutability
    return rule;
  }

  async function activate(
    id: string,
    _performedBy: string,
  ): Promise<{ activated: ITaxRuleConfigDocument; testResults: TaxRuleTestResult[] }> {
    const rule = await TaxRuleConfigModel.findById(id);
    if (!rule) throw AppError.notFound('Tax rule configuration');

    if (rule.status === 'active') {
      throw AppError.conflict('Tax rule is already active');
    }
    if (rule.status === 'frozen' || rule.status === 'superseded') {
      throw AppError.badRequest('Cannot activate a frozen or superseded rule');
    }

    // VER-INV-02: Run all 12 test cases — ALL must pass
    const testResults = runTaxRuleTestSuite(rule.toObject() as ITaxRuleConfigDocument);
    const allPassed = testResults.every((t) => t.passed);

    if (!allPassed) {
      const failedNames = testResults.filter((t) => !t.passed).map((t) => t.name);
      throw AppError.badRequest(
        `Tax rule validation failed. ${failedNames.length} test(s) did not pass.`,
        failedNames.map((n) => ({ field: 'testSuite', message: n })),
      );
    }

    // VER-INV-04: Atomically supersede previous active for same FY
    const session = await connection.startSession();
    session.startTransaction();

    try {
      await TaxRuleConfigModel.updateMany(
        { financialYear: rule.financialYear, status: 'active', _id: { $ne: rule._id } },
        { $set: { status: 'superseded' as TaxRuleStatus } },
        { session },
      );

      await TaxRuleConfigModel.updateOne(
        { _id: rule._id },
        { $set: { status: 'active' as TaxRuleStatus } },
        { session },
      );

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }

    const activated = await TaxRuleConfigModel.findById(id).lean<ITaxRuleConfigDocument>();
    if (!activated) throw AppError.notFound('Tax rule configuration');

    return { activated: activated as ITaxRuleConfigDocument, testResults };
  }

  async function correct(
    snapshotId: string,
    corrections: Record<string, unknown>,
    changeReason: string,
    createdBy: string,
  ): Promise<ITaxRuleConfigDocument> {
    const original = await TaxRuleConfigModel.findOne({ snapshotId }).lean<ITaxRuleConfigDocument>();
    if (!original) throw AppError.notFound('Tax rule configuration with given snapshotId');

    // VER-INV-07: Create new version, do NOT modify original
    const correctionData = {
      ...original,
      ...corrections,
      _id: undefined,
      snapshotId: undefined, // Pre-save generates new UUID
      version: undefined, // Pre-save auto-increments
      status: 'draft' as TaxRuleStatus,
      parentSnapshotId: snapshotId,
      changeReason,
      usageCount: 0,
      isFrozen: false,
      createdBy,
      changeLog: [],
      createdAt: undefined,
      updatedAt: undefined,
    };

    // Remove mongoose internals
    delete (correctionData as Record<string, unknown>).__v;

    const corrected = await TaxRuleConfigModel.create(correctionData);
    return corrected;
  }

  async function deleteDraft(id: string): Promise<void> {
    const rule = await TaxRuleConfigModel.findById(id);
    if (!rule) throw AppError.notFound('Tax rule configuration');

    // VER-INV-10: Only delete if draft AND usageCount=0
    if (rule.status !== 'draft') {
      throw AppError.badRequest('Only draft rules can be deleted');
    }
    if (rule.usageCount > 0) {
      throw AppError.badRequest('Cannot delete a rule that has been used in calculations');
    }

    await TaxRuleConfigModel.deleteOne({ _id: rule._id });
  }

  async function getBySnapshotId(snapshotId: string): Promise<ITaxRuleConfigDocument> {
    const rule = await TaxRuleConfigModel.findOne({ snapshotId }).lean<ITaxRuleConfigDocument>();
    if (!rule) throw AppError.notFound('Tax rule configuration');
    return rule as ITaxRuleConfigDocument;
  }

  async function getActiveForFY(financialYear: string): Promise<ITaxRuleConfigDocument> {
    const rule = await TaxRuleConfigModel.findOne({
      financialYear,
      status: 'active',
    }).lean<ITaxRuleConfigDocument>();
    if (!rule) {
      throw AppError.notFound(`No active tax rule configuration for FY ${financialYear}`);
    }
    return rule as ITaxRuleConfigDocument;
  }

  async function getHistory(financialYear: string): Promise<ITaxRuleConfigDocument[]> {
    return TaxRuleConfigModel.find({ financialYear })
      .sort({ version: -1 })
      .lean<ITaxRuleConfigDocument[]>();
  }

  async function listRules(
    query: { page?: number; limit?: number; status?: string; financialYear?: string },
  ): Promise<{ data: ITaxRuleConfigDocument[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const filter: FilterQuery<ITaxRuleConfigDocument> = {};
    if (query.status) filter.status = query.status;
    if (query.financialYear) filter.financialYear = query.financialYear;

    const [data, total] = await Promise.all([
      TaxRuleConfigModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean<ITaxRuleConfigDocument[]>(),
      TaxRuleConfigModel.countDocuments(filter),
    ]);

    return {
      data: data as ITaxRuleConfigDocument[],
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async function validateRules(id: string): Promise<TaxRuleTestResult[]> {
    const rule = await TaxRuleConfigModel.findById(id);
    if (!rule) throw AppError.notFound('Tax rule configuration');
    return runTaxRuleTestSuite(rule.toObject() as ITaxRuleConfigDocument);
  }

  async function getRuleById(id: string): Promise<ITaxRuleConfigDocument> {
    const rule = await TaxRuleConfigModel.findById(id).lean<ITaxRuleConfigDocument>();
    if (!rule) throw AppError.notFound('Tax rule configuration');
    return rule as ITaxRuleConfigDocument;
  }

  // ═══ TAX ESTIMATES ═══════════════════════════════════════════════════════

  async function calculateEstimateService(
    input: TaxEstimateInput,
    context: EstimateContext,
    userId?: string,
    leadId?: string,
    orderId?: string,
    performedBy?: string,
  ): Promise<TaxEstimateOutput & { estimateNumber: string }> {
    // 1. Fetch active rules for FY
    const rules = await getActiveForFY(input.financialYear);

    // 2. Pure function call (TAX-INV-02)
    const output = calculateTaxEstimate(input, rules);

    // 3. Atomically increment usageCount (VER-INV-03)
    await TaxRuleConfigModel.updateOne(
      { snapshotId: rules.snapshotId },
      { $inc: { usageCount: 1 }, $set: { isFrozen: true, status: 'frozen' as TaxRuleStatus } },
    );

    // 4. Store in TaxEstimateLog (TAX-INV-09)
    const seq = await getNextSequence(CounterModel, 'tax_estimate');
    const estimateNumber = `QGS-EST-${String(seq).padStart(4, '0')}`;

    await TaxEstimateLogModel.create({
      estimateNumber,
      userId: userId ?? undefined,
      leadId: leadId ?? undefined,
      orderId: orderId ?? undefined,
      financialYear: input.financialYear,
      rulesSnapshotId: rules.snapshotId,
      rulesVersion: rules.version,
      input: input as unknown as Record<string, unknown>,
      output: output as unknown as Record<string, unknown>,
      context,
      performedBy: performedBy ?? undefined,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 12 months
      isDeleted: false,
    });

    return { ...output, estimateNumber };
  }

  async function quickEstimate(
    income: number,
    deductions: number,
    residencyStatus: string,
  ): Promise<{ estimatedRefund: { low: number; high: number }; disclaimer: string }> {
    // Find latest active rule for any FY
    const rule = await TaxRuleConfigModel.findOne({ status: 'active' })
      .sort({ effectiveFrom: -1 })
      .lean<ITaxRuleConfigDocument>();
    if (!rule) {
      throw AppError.notFound('No active tax rules available');
    }

    const input: TaxEstimateInput = {
      financialYear: rule.financialYear,
      residencyStatus: residencyStatus as 'resident' | 'non_resident' | 'working_holiday',
      grossEmploymentIncome: income,
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
        workRelated: deductions,
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
      taxWithheld: income, // Assume full withholding for quick estimate
    };

    const output = calculateTaxEstimate(input, rule as ITaxRuleConfigDocument);
    // ±10% range
    const refund = output.estimatedRefundOrOwing;
    const margin = Math.round(Math.abs(refund) * 0.10);

    return {
      estimatedRefund: {
        low: refund - margin,
        high: refund + margin,
      },
      disclaimer: output.disclaimer,
    };
  }

  async function recalculate(
    input: TaxEstimateInput,
    snapshotId: string,
  ): Promise<TaxEstimateOutput> {
    const rules = await getBySnapshotId(snapshotId);
    return calculateTaxEstimate(input, rules);
  }

  async function compareFn(
    inputA: TaxEstimateInput,
    inputB: TaxEstimateInput,
    snapshotId?: string,
  ): Promise<{
    resultA: TaxEstimateOutput;
    resultB: TaxEstimateOutput;
    diff: Record<string, { a: number; b: number; delta: number }>;
  }> {
    let rules: ITaxRuleConfigDocument;
    if (snapshotId) {
      rules = await getBySnapshotId(snapshotId);
    } else {
      rules = await getActiveForFY(inputA.financialYear);
    }

    const resultA = calculateTaxEstimate(inputA, rules);
    const resultB = calculateTaxEstimate(inputB, rules);

    const diffFields = [
      'grossIncome', 'totalDeductions', 'taxableIncome', 'baseTax',
      'medicareLevyAmount', 'medicareLevySurcharge', 'litoOffset',
      'saptoOffset', 'hecsRepayment', 'totalTaxPayable', 'estimatedRefundOrOwing',
    ] as const;

    const diff: Record<string, { a: number; b: number; delta: number }> = {};
    for (const field of diffFields) {
      const a = resultA[field] as number;
      const b = resultB[field] as number;
      diff[field] = { a, b, delta: b - a };
    }

    return { resultA, resultB, diff };
  }

  // ═══ TAX RESULTS ═════════════════════════════════════════════════════════

  async function createResult(
    data: Record<string, unknown>,
    enteredBy: string,
  ): Promise<ITaxReturnResultDocument> {
    const result = await TaxReturnResultModel.create({
      ...data,
      enteredBy,
      returnType: 'original',
      isLocked: false,
      isDeleted: false,
    });
    return result;
  }

  async function getResult(
    orderId: string,
    scopeFilter?: Record<string, unknown>,
  ): Promise<ITaxReturnResultDocument> {
    const filter: FilterQuery<ITaxReturnResultDocument> = { orderId, returnType: 'original' };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(filter, scopeFilter);
    }
    const result = await TaxReturnResultModel.findOne(filter).lean<ITaxReturnResultDocument>();
    if (!result) throw AppError.notFound('Tax return result');
    return result as ITaxReturnResultDocument;
  }

  async function updateResult(
    orderId: string,
    data: Record<string, unknown>,
    scopeFilter?: Record<string, unknown>,
  ): Promise<ITaxReturnResultDocument> {
    const filter: FilterQuery<ITaxReturnResultDocument> = { orderId };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(filter, scopeFilter);
    }
    const result = await TaxReturnResultModel.findOne(filter);
    if (!result) throw AppError.notFound('Tax return result');

    // Protected fields
    const protectedKeys = ['_id', 'orderId', 'userId', 'enteredBy', 'returnType', 'originalReturnId'];
    for (const [key, value] of Object.entries(data)) {
      if (!protectedKeys.includes(key)) {
        result.set(key, value);
      }
    }

    await result.save(); // Pre-save hook enforces locked immutability
    return result;
  }

  async function verifyResult(
    orderId: string,
    verifiedBy: string,
  ): Promise<ITaxReturnResultDocument> {
    const result = await TaxReturnResultModel.findOne({ orderId });
    if (!result) throw AppError.notFound('Tax return result');

    if (result.verifiedBy) {
      throw AppError.conflict('Tax return result has already been verified');
    }

    result.set('verifiedBy', verifiedBy);
    await result.save();
    return result;
  }

  async function lockResult(
    id: string,
    lockedBy: string,
  ): Promise<ITaxReturnResultDocument> {
    const result = await TaxReturnResultModel.findById(id);
    if (!result) throw AppError.notFound('Tax return result');

    if (result.isLocked) {
      throw AppError.conflict('Tax return result is already locked');
    }

    // Use updateOne to bypass pre-save (we're explicitly locking)
    await TaxReturnResultModel.updateOne(
      { _id: result._id },
      {
        $set: {
          isLocked: true,
          lockedAt: new Date(),
          lockedBy,
        },
      },
    );

    const updated = await TaxReturnResultModel.findById(id).lean<ITaxReturnResultDocument>();
    if (!updated) throw AppError.notFound('Tax return result');
    return updated as ITaxReturnResultDocument;
  }

  // VER-INV-05: Amendment uses original's rulesSnapshotId. Staff CANNOT override.
  // VER-INV-12: amendmentChanges auto-calculated by system.
  async function createAmendment(
    originalOrderId: string,
    amendmentData: Record<string, unknown>,
    enteredBy: string,
  ): Promise<ITaxReturnResultDocument> {
    const original = await TaxReturnResultModel.findOne({
      orderId: originalOrderId,
      returnType: 'original',
    }).lean<ITaxReturnResultDocument>();

    if (!original) {
      throw AppError.notFound('Original tax return result for this order');
    }

    // Count existing amendments
    const existingAmendments = await TaxReturnResultModel.countDocuments({
      originalReturnId: original._id,
      returnType: 'amendment',
    });

    // VER-INV-12: Auto-calculate diff
    const amendmentChanges: Record<string, { from: unknown; to: unknown }> = {};
    const incomeData = amendmentData.income as Record<string, number> | undefined;
    if (incomeData && original.income) {
      for (const [key, newVal] of Object.entries(incomeData)) {
        const origVal = (original.income as unknown as Record<string, number>)[key];
        if (origVal !== undefined && origVal !== newVal) {
          amendmentChanges[`income.${key}`] = { from: origVal, to: newVal };
        }
      }
    }
    const deductionData = amendmentData.deductions as Record<string, number> | undefined;
    if (deductionData && original.deductions) {
      for (const [key, newVal] of Object.entries(deductionData)) {
        const origVal = (original.deductions as unknown as Record<string, number>)[key];
        if (origVal !== undefined && origVal !== newVal) {
          amendmentChanges[`deductions.${key}`] = { from: origVal, to: newVal };
        }
      }
    }

    const amendment = await TaxReturnResultModel.create({
      ...amendmentData,
      orderId: amendmentData.orderId ?? originalOrderId,
      userId: original.userId,
      financialYear: original.financialYear,
      rulesSnapshotId: original.rulesSnapshotId, // VER-INV-05: FORCED from original
      returnType: 'amendment',
      originalReturnId: original._id,
      amendmentNumber: existingAmendments + 1,
      amendmentChanges,
      isLocked: false,
      isDeleted: false,
      enteredBy,
    });

    return amendment;
  }

  async function getAmendments(
    orderId: string,
    scopeFilter?: Record<string, unknown>,
  ): Promise<ITaxReturnResultDocument[]> {
    // Find original first
    const original = await TaxReturnResultModel.findOne({
      orderId,
      returnType: 'original',
    }).lean<ITaxReturnResultDocument>();

    if (!original) return [];

    const filter: FilterQuery<ITaxReturnResultDocument> = {
      originalReturnId: original._id,
      returnType: 'amendment',
    };
    if (scopeFilter && Object.keys(scopeFilter).length > 0) {
      Object.assign(filter, scopeFilter);
    }

    return TaxReturnResultModel.find(filter)
      .sort({ amendmentNumber: 1 })
      .lean<ITaxReturnResultDocument[]>();
  }

  async function getEstimatesForOrder(orderId: string): Promise<ITaxEstimateLogDocument[]> {
    return TaxEstimateLogModel.find({ orderId })
      .sort({ createdAt: -1 })
      .lean<ITaxEstimateLogDocument[]>();
  }

  async function compareEstimateVsResult(
    orderId: string,
  ): Promise<{
    estimate: ITaxEstimateLogDocument | null;
    result: ITaxReturnResultDocument;
    variance: Record<string, { estimated: number; actual: number; delta: number }>;
  }> {
    const result = await TaxReturnResultModel.findOne({
      orderId,
      returnType: 'original',
    }).lean<ITaxReturnResultDocument>();
    if (!result) throw AppError.notFound('Tax return result');

    // Find most recent estimate for this order
    const estimate = await TaxEstimateLogModel.findOne({ orderId })
      .sort({ createdAt: -1 })
      .lean<ITaxEstimateLogDocument>();

    const variance: Record<string, { estimated: number; actual: number; delta: number }> = {};

    if (estimate) {
      const estOutput = estimate.output as Record<string, number>;
      const compareFields: Array<[string, number]> = [
        ['taxableIncome', result.taxableIncome],
        ['totalTaxPayable', result.totalTaxPayable],
        ['refundOrOwing', result.refundOrOwing],
      ];

      for (const [field, actual] of compareFields) {
        const estimated = estOutput[field] ?? 0;
        variance[field] = {
          estimated: typeof estimated === 'number' ? estimated : 0,
          actual,
          delta: actual - (typeof estimated === 'number' ? estimated : 0),
        };
      }
    }

    return {
      estimate: estimate as ITaxEstimateLogDocument | null,
      result: result as ITaxReturnResultDocument,
      variance,
    };
  }

  // ═══ Return Public Interface ═════════════════════════════════════════════

  return {
    createDraft,
    updateDraft,
    activate,
    correct,
    deleteDraft,
    getBySnapshotId,
    getActiveForFY,
    getHistory,
    listRules,
    validateRules,
    getRuleById,
    calculateEstimate: calculateEstimateService,
    quickEstimate,
    recalculate,
    compare: compareFn,
    createResult,
    getResult,
    updateResult,
    verifyResult,
    lockResult,
    createAmendment,
    getAmendments,
    getEstimatesForOrder,
    compareEstimateVsResult,
  };
}
