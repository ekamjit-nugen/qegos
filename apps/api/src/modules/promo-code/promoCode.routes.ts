import { Router, type Request, type Response } from 'express';
import { validationResult } from 'express-validator';
import * as _auditLog from '@nugen/audit-log';
import type { PromoCodeRouteDeps, CreatePromoCodeInput, PromoCodeListQuery } from './promoCode.types';
import { createPromoCodeService } from './promoCode.service';
import {
  createPromoCodeValidation,
  updatePromoCodeValidation,
  promoCodeIdValidation,
  listPromoCodesValidation,
} from './promoCode.validators';

const auditLog = {
  log: (params: Record<string, unknown>): void => {
    _auditLog.log(params as never).catch((err: unknown) => {
      console.warn('[AUDIT] Failed to write audit log:', err);
    });
  },
};

interface AuthRequest extends Request {
  user?: { _id: string; userId?: string; userType?: number };
}

export function createPromoCodeRoutes(deps: PromoCodeRouteDeps): Router {
  const router = Router();
  const service = createPromoCodeService({
    PromoCodeModel: deps.PromoCodeModel,
    PromoCodeUsageModel: deps.PromoCodeUsageModel,
  });

  // POST /promo-codes — create (admin)
  router.post(
    '/',
    deps.authenticate(),
    deps.checkPermission('promo_codes', 'create'),
    ...createPromoCodeValidation(),
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }
      try {
        const authReq = req as AuthRequest;
        const createdBy = authReq.user?.userId ?? authReq.user?._id ?? '';
        const promo = await service.createPromoCode(req.body as CreatePromoCodeInput, createdBy);

        auditLog.log({
          actor: createdBy,
          actorType: 'staff',
          action: 'create',
          resource: 'promo_code',
          resourceId: String(promo._id),
          severity: 'info',
          description: `Promo code created`,
        });

        res.status(201).json({ status: 201, data: promo });
      } catch (err) {
        const error = err as Error & { statusCode?: number; code?: string };
        res.status(error.statusCode ?? 500).json({
          status: error.statusCode ?? 500,
          code: error.code,
          message: error.message,
        });
      }
    },
  );

  // GET /promo-codes — list (admin)
  router.get(
    '/',
    deps.authenticate(),
    deps.checkPermission('promo_codes', 'read'),
    ...listPromoCodesValidation(),
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }
      try {
        const result = await service.listPromoCodes(req.query as unknown as PromoCodeListQuery);
        res.status(200).json({ status: 200, data: result });
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        res.status(error.statusCode ?? 500).json({ status: error.statusCode ?? 500, message: error.message });
      }
    },
  );

  // GET /promo-codes/:id — detail (admin)
  router.get(
    '/:id',
    deps.authenticate(),
    deps.checkPermission('promo_codes', 'read'),
    ...promoCodeIdValidation(),
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }
      try {
        const promo = await service.getPromoCode(req.params.id as string);
        const usage = await service.getPromoCodeUsage(req.params.id as string);
        res.status(200).json({ status: 200, data: { promoCode: promo, usage } });
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        res.status(error.statusCode ?? 500).json({ status: error.statusCode ?? 500, message: error.message });
      }
    },
  );

  // PATCH /promo-codes/:id — update (admin)
  router.patch(
    '/:id',
    deps.authenticate(),
    deps.checkPermission('promo_codes', 'update'),
    ...updatePromoCodeValidation(),
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }
      try {
        const authReq2 = req as AuthRequest;
        const promo = await service.updatePromoCode(
          req.params.id as string,
          req.body as Partial<CreatePromoCodeInput>,
        );

        auditLog.log({
          actor: authReq2.user?.userId ?? authReq2.user?._id ?? '',
          actorType: 'staff',
          action: 'update',
          resource: 'promo_code',
          resourceId: req.params.id as string,
          severity: 'warning',
          description: `Promo code updated`,
        });

        res.status(200).json({ status: 200, data: promo });
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        res.status(error.statusCode ?? 500).json({ status: error.statusCode ?? 500, message: error.message });
      }
    },
  );

  // DELETE /promo-codes/:id — deactivate (admin)
  router.delete(
    '/:id',
    deps.authenticate(),
    deps.checkPermission('promo_codes', 'delete'),
    ...promoCodeIdValidation(),
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }
      try {
        const authReq3 = req as AuthRequest;
        const promo = await service.deactivatePromoCode(req.params.id as string);

        auditLog.log({
          actor: authReq3.user?.userId ?? authReq3.user?._id ?? '',
          actorType: 'staff',
          action: 'delete',
          resource: 'promo_code',
          resourceId: req.params.id as string,
          severity: 'warning',
          description: `Promo code deactivated`,
        });

        res.status(200).json({ status: 200, data: promo });
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        res.status(error.statusCode ?? 500).json({ status: error.statusCode ?? 500, message: error.message });
      }
    },
  );

  return router;
}
