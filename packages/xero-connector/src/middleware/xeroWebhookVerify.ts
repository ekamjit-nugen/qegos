import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Xero Webhook Signature Verification Middleware.
 *
 * Xero signs webhooks with HMAC-SHA256 using the webhook key.
 * The signature is sent as a base64-encoded string in the `x-xero-signature` header.
 * The hash is computed over the raw request body.
 *
 * Per Xero docs:
 * - Must respond 200 to intent-to-receive (ITR) validation events within 5s.
 * - If signature is invalid, must still respond 401 (not 200) so Xero knows the key is wrong.
 *
 * @see https://developer.xero.com/documentation/guides/webhooks/overview
 */
export function xeroWebhookVerify(webhookKey: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signature = req.headers['x-xero-signature'] as string | undefined;

    if (!signature) {
      res.status(401).json({
        status: 401,
        code: 'XERO_WEBHOOK_NO_SIGNATURE',
        message: 'Missing x-xero-signature header',
      });
      return;
    }

    // Body must be the raw string/buffer for HMAC computation.
    // If express.raw() middleware is used upstream, req.body is a Buffer.
    // If express.json() is used, req.body is parsed — we need rawBody.
    const rawBody: Buffer | string = (req as unknown as { rawBody?: Buffer }).rawBody ?? req.body;

    const bodyStr = Buffer.isBuffer(rawBody)
      ? rawBody
      : Buffer.from(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody));

    const computedHash = createHmac('sha256', webhookKey).update(bodyStr).digest('base64');

    // Timing-safe comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signature, 'utf8');
    const computedBuffer = Buffer.from(computedHash, 'utf8');

    if (sigBuffer.length !== computedBuffer.length || !timingSafeEqual(sigBuffer, computedBuffer)) {
      // Per Xero docs: MUST return 401 for invalid signature
      res.status(401).json({
        status: 401,
        code: 'XERO_WEBHOOK_INVALID_SIGNATURE',
        message: 'Webhook signature verification failed',
      });
      return;
    }

    next();
  };
}
