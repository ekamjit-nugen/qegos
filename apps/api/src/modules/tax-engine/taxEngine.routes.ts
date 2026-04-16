import { Router, type Request, type Response } from 'express';
import type { Model, Connection } from 'mongoose';
import { asyncHandler } from '@nugen/error-handler';
import { validate } from '@nugen/validator';
import type { check as CheckFn } from '@nugen/rbac';
import type { authenticate as AuthFn, AuthenticatedRequest } from '@nugen/auth';
import type { ICounterDocument } from '../../database/counter.model';
import type {
  ITaxRuleConfigDocument,
  ITaxEstimateLogDocument,
  ITaxReturnResultDocument,
  TaxEstimateInput,
  EstimateContext,
} from './taxEngine.types';
import { createTaxEngineService } from './taxEngine.service';
import {
  createRuleDraftValidation,
  updateRuleDraftValidation,
  activateRuleValidation,
  correctRuleValidation,
  listRulesValidation,
  ruleByIdValidation,
  ruleBySnapshotValidation,
  ruleHistoryValidation,
  calculateEstimateValidation,
  quickEstimateValidation,
  recalculateValidation,
  compareEstimatesValidation,
  createResultValidation,
  updateResultValidation,
  resultByOrderValidation,
  lockResultValidation,
  createAmendmentValidation,
  estimatesByOrderValidation,
} from './taxEngine.validators';

// ─── Dependencies ──────────────────────────────────────────────────────────

export interface TaxEngineRouteDeps {
  TaxRuleConfigModel: Model<ITaxRuleConfigDocument>;
  TaxEstimateLogModel: Model<ITaxEstimateLogDocument>;
  TaxReturnResultModel: Model<ITaxReturnResultDocument>;
  CounterModel: Model<ICounterDocument>;
  connection: Connection;
  authenticate: typeof AuthFn;
  checkPermission: typeof CheckFn;
}

// ─── Factory ───────────────────────────────────────────────────────────────

export function createTaxEngineRoutes(deps: TaxEngineRouteDeps): Router {
  const router = Router();
  const { authenticate: auth, checkPermission: check } = deps;

  const service = createTaxEngineService({
    TaxRuleConfigModel: deps.TaxRuleConfigModel,
    TaxEstimateLogModel: deps.TaxEstimateLogModel,
    TaxReturnResultModel: deps.TaxReturnResultModel,
    CounterModel: deps.CounterModel,
    connection: deps.connection,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TAX RULES
  // ═══════════════════════════════════════════════════════════════════════════

  // --- GET /rules --- List rules with filters
  router.get(
    '/rules',
    auth() as never,
    check('system_config', 'read') as never,
    ...validate(listRulesValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const result = await service.listRules({
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        status: req.query.status as string | undefined,
        financialYear: req.query.financialYear as string | undefined,
      });
      res.status(200).json({ status: 200, data: result.data, meta: result.meta });
    }),
  );

  // --- GET /rules/active/:financialYear --- Get active rule for FY
  router.get(
    '/rules/active/:financialYear',
    auth() as never,
    ...validate(ruleHistoryValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const rule = await service.getActiveForFY(req.params.financialYear);
      res.status(200).json({ status: 200, data: rule });
    }),
  );

  // --- GET /rules/history/:financialYear --- Get version history for FY
  router.get(
    '/rules/history/:financialYear',
    auth() as never,
    check('system_config', 'read') as never,
    ...validate(ruleHistoryValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const history = await service.getHistory(req.params.financialYear);
      res.status(200).json({ status: 200, data: history });
    }),
  );

  // --- GET /rules/snapshot/:snapshotId --- Get rule by snapshot ID
  router.get(
    '/rules/snapshot/:snapshotId',
    auth() as never,
    check('system_config', 'read') as never,
    ...validate(ruleBySnapshotValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const rule = await service.getBySnapshotId(req.params.snapshotId);
      res.status(200).json({ status: 200, data: rule });
    }),
  );

  // --- GET /rules/:id --- Get rule by ID
  router.get(
    '/rules/:id',
    auth() as never,
    check('system_config', 'read') as never,
    ...validate(ruleByIdValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const rule = await service.getRuleById(req.params.id);
      res.status(200).json({ status: 200, data: rule });
    }),
  );

  // --- POST /rules --- Create draft rule
  router.post(
    '/rules',
    auth() as never,
    check('system_config', 'create') as never,
    ...validate(createRuleDraftValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const rule = await service.createDraft(
        req.body as Record<string, unknown>,
        authReq.user.userId,
      );
      res.status(201).json({ status: 201, data: rule });
    }),
  );

  // --- PATCH /rules/:id --- Update draft rule
  router.patch(
    '/rules/:id',
    auth() as never,
    check('system_config', 'update') as never,
    ...validate(updateRuleDraftValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const rule = await service.updateDraft(req.params.id, req.body as Record<string, unknown>);
      res.status(200).json({ status: 200, data: rule });
    }),
  );

  // --- PATCH /rules/:id/activate --- Activate rule (runs test suite)
  router.patch(
    '/rules/:id/activate',
    auth() as never,
    check('system_config', 'update') as never,
    ...validate(activateRuleValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const result = await service.activate(req.params.id, authReq.user.userId);
      res.status(200).json({
        status: 200,
        data: result.activated,
        meta: { testResults: result.testResults },
      });
    }),
  );

  // --- POST /rules/:id/validate --- Run test suite without activating
  router.post(
    '/rules/:id/validate',
    auth() as never,
    check('system_config', 'read') as never,
    ...validate(ruleByIdValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const testResults = await service.validateRules(req.params.id);
      const allPassed = testResults.every((t) => t.passed);
      res.status(200).json({
        status: 200,
        data: { allPassed, testResults },
      });
    }),
  );

  // --- POST /rules/snapshot/:snapshotId/correct --- Create correction
  router.post(
    '/rules/snapshot/:snapshotId/correct',
    auth() as never,
    check('system_config', 'create') as never,
    ...validate(correctRuleValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { changeReason, corrections } = req.body as {
        changeReason: string;
        corrections: Record<string, unknown>;
      };
      const rule = await service.correct(
        req.params.snapshotId,
        corrections,
        changeReason,
        authReq.user.userId,
      );
      res.status(201).json({ status: 201, data: rule });
    }),
  );

  // --- DELETE /rules/:id --- Delete draft rule
  router.delete(
    '/rules/:id',
    auth() as never,
    check('system_config', 'delete') as never,
    ...validate(ruleByIdValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      await service.deleteDraft(req.params.id);
      res.status(200).json({ status: 200, data: { message: 'Draft rule deleted' } });
    }),
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // TAX ESTIMATES
  // ═══════════════════════════════════════════════════════════════════════════

  // --- POST /estimates --- Full estimate calculation
  router.post(
    '/estimates',
    auth() as never,
    check('tax_estimate', 'create') as never,
    ...validate(calculateEstimateValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const body = req.body as Record<string, unknown>;

      // Build TaxEstimateInput from validated body
      const input: TaxEstimateInput = {
        financialYear: body.financialYear as string,
        residencyStatus: body.residencyStatus as 'resident' | 'non_resident' | 'working_holiday',
        grossEmploymentIncome: body.grossEmploymentIncome as number,
        businessIncome: (body.businessIncome as number) ?? 0,
        rentalIncome: (body.rentalIncome as number) ?? 0,
        interestIncome: (body.interestIncome as number) ?? 0,
        dividendIncome: (body.dividendIncome as number) ?? 0,
        dividendFrankingCredits: (body.dividendFrankingCredits as number) ?? 0,
        capitalGains: {
          shortTerm: (body.capitalGains as Record<string, number>)?.shortTerm ?? 0,
          longTerm: (body.capitalGains as Record<string, number>)?.longTerm ?? 0,
        },
        foreignIncome: (body.foreignIncome as number) ?? 0,
        governmentPayments: (body.governmentPayments as number) ?? 0,
        superannuationIncome: (body.superannuationIncome as number) ?? 0,
        deductions: {
          workRelated: (body.deductions as Record<string, number>)?.workRelated ?? 0,
          selfEducation: (body.deductions as Record<string, number>)?.selfEducation ?? 0,
          vehicleExpenses: (body.deductions as Record<string, number>)?.vehicleExpenses ?? 0,
          homeOffice: (body.deductions as Record<string, number>)?.homeOffice ?? 0,
          donations: (body.deductions as Record<string, number>)?.donations ?? 0,
          incomeProtection: (body.deductions as Record<string, number>)?.incomeProtection ?? 0,
          accountingFees: (body.deductions as Record<string, number>)?.accountingFees ?? 0,
          other: (body.deductions as Record<string, number>)?.other ?? 0,
        },
        privateHealthInsurance: (body.privateHealthInsurance as boolean) ?? true,
        hasHecsDebt: (body.hasHecsDebt as boolean) ?? false,
        hasSfssDebt: (body.hasSfssDebt as boolean) ?? false,
        isEligibleSenior: (body.isEligibleSenior as boolean) ?? false,
        spouseIncome: body.spouseIncome as number | undefined,
        numberOfDependants: (body.numberOfDependants as number) ?? 0,
        taxWithheld: (body.taxWithheld as number) ?? 0,
      };

      const result = await service.calculateEstimate(
        input,
        body.context as EstimateContext,
        body.userId as string | undefined,
        body.leadId as string | undefined,
        body.orderId as string | undefined,
        authReq.user.userId,
      );

      res.status(201).json({ status: 201, data: result });
    }),
  );

  // --- POST /estimates/quick --- Quick estimate (landing page / phone call)
  router.post(
    '/estimates/quick',
    auth() as never,
    ...validate(quickEstimateValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const {
        income,
        deductions = 0,
        residencyStatus = 'resident',
      } = req.body as {
        income: number;
        deductions?: number;
        residencyStatus?: string;
      };
      const result = await service.quickEstimate(income, deductions, residencyStatus);
      res.status(200).json({ status: 200, data: result });
    }),
  );

  // --- POST /estimates/recalculate/:snapshotId --- Recalculate with specific rules
  router.post(
    '/estimates/recalculate/:snapshotId',
    auth() as never,
    check('tax_estimate', 'create') as never,
    ...validate(recalculateValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const body = req.body as Record<string, unknown>;

      const input: TaxEstimateInput = {
        financialYear: body.financialYear as string,
        residencyStatus: body.residencyStatus as 'resident' | 'non_resident' | 'working_holiday',
        grossEmploymentIncome: body.grossEmploymentIncome as number,
        businessIncome: (body.businessIncome as number) ?? 0,
        rentalIncome: (body.rentalIncome as number) ?? 0,
        interestIncome: (body.interestIncome as number) ?? 0,
        dividendIncome: (body.dividendIncome as number) ?? 0,
        dividendFrankingCredits: (body.dividendFrankingCredits as number) ?? 0,
        capitalGains: {
          shortTerm: (body.capitalGains as Record<string, number>)?.shortTerm ?? 0,
          longTerm: (body.capitalGains as Record<string, number>)?.longTerm ?? 0,
        },
        foreignIncome: (body.foreignIncome as number) ?? 0,
        governmentPayments: (body.governmentPayments as number) ?? 0,
        superannuationIncome: (body.superannuationIncome as number) ?? 0,
        deductions: {
          workRelated: (body.deductions as Record<string, number>)?.workRelated ?? 0,
          selfEducation: (body.deductions as Record<string, number>)?.selfEducation ?? 0,
          vehicleExpenses: (body.deductions as Record<string, number>)?.vehicleExpenses ?? 0,
          homeOffice: (body.deductions as Record<string, number>)?.homeOffice ?? 0,
          donations: (body.deductions as Record<string, number>)?.donations ?? 0,
          incomeProtection: (body.deductions as Record<string, number>)?.incomeProtection ?? 0,
          accountingFees: (body.deductions as Record<string, number>)?.accountingFees ?? 0,
          other: (body.deductions as Record<string, number>)?.other ?? 0,
        },
        privateHealthInsurance: (body.privateHealthInsurance as boolean) ?? true,
        hasHecsDebt: (body.hasHecsDebt as boolean) ?? false,
        hasSfssDebt: (body.hasSfssDebt as boolean) ?? false,
        isEligibleSenior: (body.isEligibleSenior as boolean) ?? false,
        spouseIncome: body.spouseIncome as number | undefined,
        numberOfDependants: (body.numberOfDependants as number) ?? 0,
        taxWithheld: (body.taxWithheld as number) ?? 0,
      };

      const result = await service.recalculate(input, req.params.snapshotId);
      res.status(200).json({ status: 200, data: result });
    }),
  );

  // --- POST /estimates/compare --- Side-by-side comparison
  router.post(
    '/estimates/compare',
    auth() as never,
    check('tax_estimate', 'create') as never,
    ...validate(compareEstimatesValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { inputA, inputB, snapshotId } = req.body as {
        inputA: TaxEstimateInput;
        inputB: TaxEstimateInput;
        snapshotId?: string;
      };
      const result = await service.compare(inputA, inputB, snapshotId);
      res.status(200).json({ status: 200, data: result });
    }),
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // TAX RESULTS
  // ═══════════════════════════════════════════════════════════════════════════

  // --- POST /results --- Create tax return result
  router.post(
    '/results',
    auth() as never,
    check('tax_result', 'create') as never,
    ...validate(createResultValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const result = await service.createResult(
        req.body as Record<string, unknown>,
        authReq.user.userId,
      );
      res.status(201).json({ status: 201, data: result });
    }),
  );

  // --- GET /results/order/:orderId --- Get result by order
  router.get(
    '/results/order/:orderId',
    auth() as never,
    check('tax_result', 'read') as never,
    ...validate(resultByOrderValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const result = await service.getResult(req.params.orderId, authReq.scopeFilter);
      res.status(200).json({ status: 200, data: result });
    }),
  );

  // --- PATCH /results/order/:orderId --- Update result
  router.patch(
    '/results/order/:orderId',
    auth() as never,
    check('tax_result', 'update') as never,
    ...validate(updateResultValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const result = await service.updateResult(
        req.params.orderId,
        req.body as Record<string, unknown>,
        authReq.scopeFilter,
      );
      res.status(200).json({ status: 200, data: result });
    }),
  );

  // --- PATCH /results/order/:orderId/verify --- Verify result
  router.patch(
    '/results/order/:orderId/verify',
    auth() as never,
    check('tax_result', 'update') as never,
    ...validate(resultByOrderValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const result = await service.verifyResult(req.params.orderId, authReq.user.userId);
      res.status(200).json({ status: 200, data: result });
    }),
  );

  // --- PATCH /results/:id/lock --- Lock result (permanent)
  router.patch(
    '/results/:id/lock',
    auth() as never,
    check('tax_result', 'update') as never,
    ...validate(lockResultValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const result = await service.lockResult(req.params.id, authReq.user.userId);
      res.status(200).json({ status: 200, data: result });
    }),
  );

  // --- POST /results/order/:orderId/amend --- Create amendment
  router.post(
    '/results/order/:orderId/amend',
    auth() as never,
    check('tax_result', 'create') as never,
    ...validate(createAmendmentValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const amendment = await service.createAmendment(
        req.params.orderId,
        req.body as Record<string, unknown>,
        authReq.user.userId,
      );
      res.status(201).json({ status: 201, data: amendment });
    }),
  );

  // --- GET /results/order/:orderId/amendments --- Get amendments
  router.get(
    '/results/order/:orderId/amendments',
    auth() as never,
    check('tax_result', 'read') as never,
    ...validate(resultByOrderValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const amendments = await service.getAmendments(req.params.orderId, authReq.scopeFilter);
      res.status(200).json({ status: 200, data: amendments });
    }),
  );

  // --- GET /results/order/:orderId/estimates --- Get estimates for order
  router.get(
    '/results/order/:orderId/estimates',
    auth() as never,
    check('tax_estimate', 'read') as never,
    ...validate(estimatesByOrderValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const estimates = await service.getEstimatesForOrder(req.params.orderId);
      res.status(200).json({ status: 200, data: estimates });
    }),
  );

  // --- GET /results/order/:orderId/variance --- Compare estimate vs result
  router.get(
    '/results/order/:orderId/variance',
    auth() as never,
    check('tax_result', 'read') as never,
    ...validate(resultByOrderValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const variance = await service.compareEstimateVsResult(req.params.orderId);
      res.status(200).json({ status: 200, data: variance });
    }),
  );

  return router;
}
