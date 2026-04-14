import { Router, type Request, type Response } from 'express';
import { validationResult } from 'express-validator';
import * as _auditLog from '@nugen/audit-log';
import { getRequestId } from '../../lib/requestContext';
import type { SettingsRouteDeps } from './settings.types';
import { createSettingsService } from './settings.service';
import { getSettingValidation, updateSettingValidation } from './settings.validators';

const auditLog = {
  log: (params: Record<string, unknown>): void => {
    _auditLog.log({ ...params, requestId: getRequestId() } as never).catch(() => {
      // fire-and-forget: audit log failure is non-critical
    });
  },
};

interface AuthRequest extends Request {
  user?: { _id: string; userType?: number };
}

export function createSettingsRoutes(deps: SettingsRouteDeps): Router {
  const router = Router();
  const service = createSettingsService({ SettingModel: deps.SettingModel });

  // GET /settings — list all settings (admin only)
  router.get(
    '/',
    deps.authenticate(),
    deps.checkPermission('settings', 'read'),
    async (_req: Request, res: Response): Promise<void> => {
      try {
        const settings = await service.getAllSettings();
        res.status(200).json({ status: 200, data: { settings } });
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        res.status(error.statusCode ?? 500).json({
          status: error.statusCode ?? 500,
          message: error.message,
        });
      }
    },
  );

  // GET /settings/:key — get a single setting
  router.get(
    '/:key',
    deps.authenticate(),
    deps.checkPermission('settings', 'read'),
    ...getSettingValidation(),
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }
      try {
        const setting = await service.getSettingDoc(req.params.key as string);
        if (!setting) {
          res.status(404).json({ status: 404, message: 'Setting not found' });
          return;
        }
        res.status(200).json({ status: 200, data: setting });
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        res.status(error.statusCode ?? 500).json({
          status: error.statusCode ?? 500,
          message: error.message,
        });
      }
    },
  );

  // PATCH /settings/:key — update a setting value
  router.patch(
    '/:key',
    deps.authenticate(),
    deps.checkPermission('settings', 'update'),
    ...updateSettingValidation(),
    async (req: AuthRequest, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }
      try {
        const { value } = req.body as { value: unknown };
        const userId = req.user?._id ?? '';
        const setting = await service.setSetting(
          req.params.key as string,
          value,
          userId,
        );

        auditLog.log({
          actor: userId,
          actorType: 'staff',
          action: 'config_change',
          resource: 'settings',
          resourceId: req.params.key as string,
          severity: 'critical',
          description: `Setting ${req.params.key} updated`,
        });

        res.status(200).json({ status: 200, data: setting });
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        res.status(error.statusCode ?? 500).json({
          status: error.statusCode ?? 500,
          message: error.message,
        });
      }
    },
  );

  return router;
}
