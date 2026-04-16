/**
 * Payment compensation listener — restores domain state when a Stripe
 * intent never settles (`payment.failed` / `payment.cancelled`).
 *
 * Why this exists:
 *
 *   The partial-Stripe paths in Pay Now (apps/api/src/modules/client-portal/
 *   payOrder.routes.ts) and Collect Payment (apps/api/src/modules/order-
 *   management/collectPayment.routes.ts) provisionally apply credits +
 *   promo BEFORE Stripe confirms the charge. The user sees the right
 *   amounts in their order detail, and the webhook is supposed to
 *   reconcile state on success/failure.
 *
 *   The "success" half was wired (webhook flips Payment.status →
 *   succeeded → existing listener marks Order paid). The "failure" half
 *   was not. When a customer abandons checkout, Stripe eventually fires
 *   `payment_intent.canceled` (or `.payment_failed` on a card decline);
 *   `webhookProcessor` updates the Payment row and emits
 *   `payment.cancelled` / `payment.failed` via `paymentEvents` — but
 *   nothing in the app subscribes to those events. Result: credits gone,
 *   promo usage counted, order still pending. The user reloads the page,
 *   tries again, and may pay full price with no credits left to apply.
 *
 *   This listener closes the loop. On either failure event, it:
 *
 *     1. Re-credits the user (addCredit type=refund_credit, refId=orderId)
 *     2. Revokes the promo usage (deletes usage row + decrements counter)
 *     3. Resets the order's provisional creditApplied/promoCode/discount
 *        and restores finalAmount = totalAmount
 *     4. Marks Payment.domainCompensated = true so concurrent or replayed
 *        webhooks don't double-compensate
 *
 *   Idempotency rests on the `domainCompensated` field. addCredit does
 *   NOT dedupe by referenceId, so without that guard a duplicate webhook
 *   would credit the user twice. revokePromoCode is naturally idempotent
 *   (deleteMany returns 0 the second time, no decrement happens).
 *
 *   Deliberately NOT in scope:
 *
 *   - The full-credit fast path (no Stripe call at all). That path runs
 *     a saga in-route, so a failure rolls back synchronously — no event
 *     compensation needed.
 *   - The admin full-refund flow. That has its own saga in
 *     refund.routes.ts; the `payment.refunded` event is left to
 *     reconciliation tools, not this listener.
 *   - Stripe Dashboard refunds (charge.refunded for payments not driven
 *     through our admin route). Those need a separate listener; out of
 *     scope here.
 *   - Mid-flight saga wrapping of the partial path itself. The webhook
 *     listener catches eventually (Stripe times out abandoned intents
 *     within ~24h). A route-level saga would catch immediately on
 *     synchronous failures (e.g. Stripe API down, network error after
 *     credits deducted) but is a separate hardening pass.
 *
 *   Failure handling: if a compensation step throws, the listener logs
 *   to audit at `critical` severity and continues. We must not throw
 *   from an event handler — Node's EventEmitter will crash the process.
 *   Manual reconciliation lives in the audit log entry.
 */

import type { Model } from 'mongoose';
import * as _auditLog from '@nugen/audit-log';
import {
  paymentEvents,
  type PaymentEventPayload,
  type IPaymentDocument,
} from '@nugen/payment-gateway';
import { getRequestId } from '../../lib/requestContext';
import type { CreditServiceResult } from '../credit/credit.service';
import type { PromoCodeServiceResult } from '../promo-code/promoCode.service';
import type { IOrderDocument2 } from './order.types';

const auditLog = {
  log: (params: Record<string, unknown>): void => {
    _auditLog.log({ ...params, requestId: getRequestId() } as never).catch(() => {
      // fire-and-forget: audit log failure is non-critical
    });
  },
};

export interface PaymentCompensationDeps {
  OrderModel: Model<IOrderDocument2>;
  PaymentModel: Model<IPaymentDocument>;
  creditService: CreditServiceResult;
  promoCodeService: PromoCodeServiceResult;
}

type FailureEvent = 'failed' | 'cancelled';

interface CompensationStepResult {
  name: string;
  ok: boolean;
  error?: string;
}

/**
 * Register listeners on `paymentEvents` for the failure events. Returns
 * an `unregister` function used by tests (and shutdown) to detach.
 *
 * Safe to call once at app boot. Calling twice would double-fire each
 * compensation — guard against that at the caller (server.ts wires it
 * exactly once).
 */
export function registerPaymentCompensationListener(deps: PaymentCompensationDeps): () => void {
  const { OrderModel, PaymentModel, creditService, promoCodeService } = deps;

  async function compensate(payload: PaymentEventPayload, eventType: FailureEvent): Promise<void> {
    try {
      const payment = await PaymentModel.findById(payload.paymentId);
      if (!payment) {
        // Payment vanished between webhook receipt and event delivery.
        // Nothing we can do — the webhook processor would have logged
        // the original miss; bail silently.
        return;
      }

      // Idempotency guard: duplicate webhook delivery, EventEmitter
      // re-fire, or two webhooks racing all hit this same payment row.
      // Once compensated, never compensate again.
      if (payment.domainCompensated === true) {
        return;
      }

      const order = await OrderModel.findById(payload.orderId);
      if (!order) {
        // Payment exists but order doesn't — orphaned payment. Mark
        // compensated so we don't loop, and audit so ops sees it.
        payment.domainCompensated = true;
        payment.domainCompensatedAt = new Date();
        await payment.save();
        auditLog.log({
          actor: 'system:payment-compensation',
          actorType: 'system',
          action: 'compensate',
          resource: 'payment',
          resourceId: String(payment._id),
          severity: 'high',
          description: `Payment ${eventType} for orphaned payment (orderId=${payload.orderId} not found); no domain state to restore`,
        });
        return;
      }

      // If the order somehow ended up paid (rare — would mean a second
      // intent succeeded for the same order), don't undo state that's
      // backing a real successful payment.
      if (order.paymentStatus === 'succeeded') {
        payment.domainCompensated = true;
        payment.domainCompensatedAt = new Date();
        await payment.save();
        auditLog.log({
          actor: 'system:payment-compensation',
          actorType: 'system',
          action: 'compensate',
          resource: 'payment',
          resourceId: String(payment._id),
          severity: 'warning',
          description: `Payment ${eventType} but order ${order.orderNumber} already succeeded — skipping compensation (a different intent likely settled)`,
        });
        return;
      }

      const userId = String(order.userId);
      const creditApplied = order.creditApplied ?? 0;
      const promoCode = order.promoCode;
      const discountAmount = order.discountAmount ?? 0;

      const results: CompensationStepResult[] = [];

      // 1. Re-credit
      if (creditApplied > 0) {
        try {
          await creditService.addCredit(
            userId,
            creditApplied,
            'refund_credit',
            `Payment ${eventType} compensation: credits restored for order ${order.orderNumber}`,
            String(order._id),
          );
          results.push({ name: 'reCreditUser', ok: true });
        } catch (err) {
          results.push({ name: 'reCreditUser', ok: false, error: (err as Error).message });
        }
      }

      // 2. Revoke promo usage
      if (promoCode && discountAmount > 0) {
        try {
          await promoCodeService.revokePromoCode(promoCode, userId, String(order._id));
          results.push({ name: 'revokePromoCode', ok: true });
        } catch (err) {
          results.push({ name: 'revokePromoCode', ok: false, error: (err as Error).message });
        }
      }

      // 3. Reset the order's provisional fields back to "no discounts /
      //    credits applied" so the user sees a clean slate when they
      //    retry payment. We don't touch paymentStatus — the existing
      //    pending state is correct (the order is still unpaid).
      try {
        order.creditApplied = 0;
        order.promoCode = undefined;
        order.discountAmount = 0;
        order.finalAmount = order.totalAmount;
        await order.save();
        results.push({ name: 'resetOrderProvisional', ok: true });
      } catch (err) {
        results.push({ name: 'resetOrderProvisional', ok: false, error: (err as Error).message });
      }

      // 4. Mark idempotency so duplicate webhooks no-op. Set even if a
      //    step failed — re-running won't fix the broken step (same
      //    underlying error will recur), and we don't want infinite
      //    retries via webhook redelivery.
      payment.domainCompensated = true;
      payment.domainCompensatedAt = new Date();
      await payment.save();

      const anyFailed = results.some((r) => !r.ok);
      auditLog.log({
        actor: 'system:payment-compensation',
        actorType: 'system',
        action: 'compensate',
        resource: 'payment',
        resourceId: String(payment._id),
        severity: anyFailed ? 'critical' : 'info',
        description: anyFailed
          ? `Payment ${eventType} compensation PARTIAL for order ${order.orderNumber}: ${JSON.stringify(results)} — MANUAL RECONCILIATION REQUIRED`
          : `Payment ${eventType} compensation complete for order ${order.orderNumber}: ${results.length} step(s) [${results.map((r) => r.name).join(', ')}]`,
      });
    } catch (err) {
      // Last-resort guard. If the listener itself crashes (DB down,
      // model corrupted, etc.) we must not propagate — Node would treat
      // the unhandled rejection as fatal. Log and swallow.
      auditLog.log({
        actor: 'system:payment-compensation',
        actorType: 'system',
        action: 'compensate',
        resource: 'payment',
        resourceId: payload.paymentId,
        severity: 'critical',
        description: `Payment compensation listener crashed for ${eventType} on payment ${payload.paymentId}: ${(err as Error).message}`,
      });
    }
  }

  const onFailed = (payload: PaymentEventPayload): void => {
    void compensate(payload, 'failed');
  };
  const onCancelled = (payload: PaymentEventPayload): void => {
    void compensate(payload, 'cancelled');
  };

  paymentEvents.on('payment.failed', onFailed);
  paymentEvents.on('payment.cancelled', onCancelled);

  return () => {
    paymentEvents.off('payment.failed', onFailed);
    paymentEvents.off('payment.cancelled', onCancelled);
  };
}
