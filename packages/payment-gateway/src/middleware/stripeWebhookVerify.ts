import type { Request, Response, NextFunction, RequestHandler } from 'express';
import Stripe from 'stripe';
import { AppError } from '@nugen/error-handler';

let _webhookSecret: string | null = null;

/**
 * Initialize the Stripe webhook verification middleware.
 */
export function initStripeWebhookVerify(webhookSecret: string): void {
  _webhookSecret = webhookSecret;
}

/**
 * PAY-INV-04: Stripe webhook signature verification middleware.
 *
 * CRITICAL: This middleware MUST receive the raw body (not parsed JSON).
 * The webhook route must use express.raw({type: 'application/json'}) instead of express.json().
 * Stripe's constructEvent() requires the raw body to verify the signature.
 */
export function stripeWebhookVerify(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!_webhookSecret) {
      next(AppError.internal('Stripe webhook secret not configured'));
      return;
    }

    const sig = req.headers['stripe-signature'];
    if (!sig) {
      next(AppError.badRequest('Missing Stripe-Signature header'));
      return;
    }

    // req.body should be a Buffer (raw body) when express.raw() is used
    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody)) {
      next(
        AppError.internal(
          'Stripe webhook requires raw body. Ensure express.raw() middleware is used on this route.',
        ),
      );
      return;
    }

    try {
      const stripe = new Stripe(_webhookSecret, {
        apiVersion: '2024-04-10' as Stripe.LatestApiVersion,
      });
      const event = stripe.webhooks.constructEvent(
        rawBody,
        sig as string,
        _webhookSecret,
      );

      // Attach the verified event to the request for the handler
      (req as Request & { stripeEvent: Stripe.Event }).stripeEvent = event;
      next();
    } catch (err) {
      next(AppError.badRequest(`Stripe webhook signature verification failed: ${(err as Error).message}`));
    }
  };
}
