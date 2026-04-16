import crypto from 'crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError } from '@nugen/error-handler';

let _webhookSecret: string | null = null;

/**
 * Initialize the Payroo webhook verification middleware.
 */
export function initPayrooWebhookVerify(webhookSecret: string): void {
  _webhookSecret = webhookSecret;
}

/**
 * PAY-INV-05: Payroo HMAC-SHA256 webhook signature verification middleware.
 *
 * Verifies the X-Payroo-Signature header against the request body.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function payrooWebhookVerify(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!_webhookSecret) {
      next(AppError.internal('Payroo webhook secret not configured'));
      return;
    }

    const signature = req.headers['x-payroo-signature'];
    if (!signature || typeof signature !== 'string') {
      next(AppError.badRequest('Missing X-Payroo-Signature header'));
      return;
    }

    // Compute expected signature
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac('sha256', _webhookSecret)
      .update(body)
      .digest('hex');

    // Timing-safe comparison to prevent timing attacks
    try {
      const sigBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      if (
        sigBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
      ) {
        next(AppError.badRequest('Payroo webhook signature verification failed'));
        return;
      }
    } catch {
      next(AppError.badRequest('Payroo webhook signature verification failed'));
      return;
    }

    next();
  };
}
