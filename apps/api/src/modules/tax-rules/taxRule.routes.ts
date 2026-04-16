import { Router, type Request, type Response } from 'express';
import type { Model } from 'mongoose';
import { AppError, asyncHandler } from '@nugen/error-handler';
import { validate, objectId, pagination, requiredString } from '@nugen/validator';
import type { check as CheckFn } from '@nugen/rbac';
import type { authenticate as AuthFn, AuthenticatedRequest } from '@nugen/auth';
import type { ITaxRuleConfigDocument } from './taxRule.types';

export interface TaxRuleRouteDeps {
  TaxRuleConfigModel: Model<ITaxRuleConfigDocument>;
  authenticate: typeof AuthFn;
  checkPermission: typeof CheckFn;
}

export function createTaxRuleRoutes(deps: TaxRuleRouteDeps): Router {
  const router = Router();
  const { TaxRuleConfigModel, authenticate: auth, checkPermission: check } = deps;

  // --- GET /tax-rules ---
  router.get(
    '/',
    auth() as never,
    check('system_config', 'read') as never,
    ...validate(pagination()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const skip = (page - 1) * limit;

      const filter: Record<string, unknown> = {};
      if (req.query.status) {
        filter.status = req.query.status;
      }
      if (req.query.financialYear) {
        filter.financialYear = req.query.financialYear;
      }

      const [rules, total] = await Promise.all([
        TaxRuleConfigModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        TaxRuleConfigModel.countDocuments(filter),
      ]);

      res.status(200).json({
        status: 200,
        data: rules,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }),
  );

  // --- GET /tax-rules/active ---
  router.get(
    '/active',
    auth() as never,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const now = new Date();
      const activeRule = await TaxRuleConfigModel.findOne({
        status: 'active',
        effectiveFrom: { $lte: now },
        effectiveTo: { $gte: now },
      }).lean();

      if (!activeRule) {
        throw AppError.notFound('No active tax rule configuration for current date');
      }

      res.status(200).json({ status: 200, data: activeRule });
    }),
  );

  // --- GET /tax-rules/:id ---
  router.get(
    '/:id',
    auth() as never,
    check('system_config', 'read') as never,
    ...validate([objectId('id')]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const rule = await TaxRuleConfigModel.findById(req.params.id).lean();
      if (!rule) {
        throw AppError.notFound('Tax rule configuration');
      }
      res.status(200).json({ status: 200, data: rule });
    }),
  );

  // --- POST /tax-rules ---
  router.post(
    '/',
    auth() as never,
    check('system_config', 'create') as never,
    ...validate([requiredString('name'), requiredString('financialYear')]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const body = req.body as Record<string, unknown>;

      const rule = await TaxRuleConfigModel.create({
        ...body,
        status: 'draft',
        usageCount: 0,
        isFrozen: false,
        createdBy: authReq.user.userId,
      });

      res.status(201).json({ status: 201, data: rule });
    }),
  );

  // --- PATCH /tax-rules/:id ---
  router.patch(
    '/:id',
    auth() as never,
    check('system_config', 'update') as never,
    ...validate([objectId('id')]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const rule = await TaxRuleConfigModel.findById(req.params.id);
      if (!rule) {
        throw AppError.notFound('Tax rule configuration');
      }

      const body = req.body as Record<string, unknown>;
      for (const [key, value] of Object.entries(body)) {
        rule.set(key, value);
      }

      // Pre-save hook will enforce immutability for frozen rules
      await rule.save();

      res.status(200).json({ status: 200, data: rule });
    }),
  );

  // --- PATCH /tax-rules/:id/activate ---
  // FIX for Vegeta B-26: Use updateOne for status transitions, not pre-save bypass
  router.patch(
    '/:id/activate',
    auth() as never,
    check('system_config', 'update') as never,
    ...validate([objectId('id')]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const rule = await TaxRuleConfigModel.findById(req.params.id);
      if (!rule) {
        throw AppError.notFound('Tax rule configuration');
      }

      if (rule.status === 'active') {
        throw AppError.conflict('Tax rule is already active');
      }

      // Deactivate any other active rule for the same financial year
      await TaxRuleConfigModel.updateMany(
        { financialYear: rule.financialYear, status: 'active', _id: { $ne: rule._id } },
        { $set: { status: 'archived' } },
      );

      // Use updateOne to set status without triggering pre-save immutability check
      await TaxRuleConfigModel.updateOne({ _id: rule._id }, { $set: { status: 'active' } });

      const updated = await TaxRuleConfigModel.findById(rule._id).lean();
      res.status(200).json({ status: 200, data: updated });
    }),
  );

  // --- POST /tax-rules/:id/increment-usage ---
  router.post(
    '/:id/increment-usage',
    auth() as never,
    ...validate([objectId('id')]),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      // Use updateOne to atomically increment usage and freeze
      const result = await TaxRuleConfigModel.updateOne(
        { _id: req.params.id, status: 'active' },
        {
          $inc: { usageCount: 1 },
          $set: { isFrozen: true },
        },
      );

      if (result.matchedCount === 0) {
        throw AppError.notFound('Active tax rule configuration');
      }

      res.status(200).json({ status: 200, data: { message: 'Usage incremented' } });
    }),
  );

  return router;
}
