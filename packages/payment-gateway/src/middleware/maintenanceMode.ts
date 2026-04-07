import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { Model } from 'mongoose';
import type { IGatewayConfigDocument } from '../types';

let _GatewayConfigModel: Model<IGatewayConfigDocument> | null = null;

/**
 * Initialize the maintenance mode middleware.
 */
export function initMaintenanceMode(GatewayConfigModel: Model<IGatewayConfigDocument>): void {
  _GatewayConfigModel = GatewayConfigModel;
}

/**
 * PAY-INV-10: Maintenance mode middleware.
 * If maintenanceMode=true, all payment endpoints return 503
 * with the configured maintenance message and a Retry-After header.
 */
export function maintenanceMode(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip maintenance check for webhook endpoints — they should always be received
    if (req.path.startsWith('/webhooks')) {
      next();
      return;
    }

    // Skip for config endpoints — admins need access during maintenance
    if (req.path.startsWith('/config')) {
      next();
      return;
    }

    if (!_GatewayConfigModel) {
      next();
      return;
    }

    try {
      const config = await _GatewayConfigModel.findOne().lean();
      if (config?.maintenanceMode) {
        res.status(503).json({
          status: 503,
          code: 'PAYMENT_MAINTENANCE',
          message: config.maintenanceMessage || 'Payment processing is temporarily unavailable.',
          retryAfter: 3600,
        });
        return;
      }
    } catch {
      // If we can't read config, don't block payments — fail open
    }

    next();
  };
}
