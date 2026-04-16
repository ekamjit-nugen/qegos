/**
 * Admin-facing "full refund" route — saga-wrapped.
 *
 * Why this exists:
 *
 *   The package-level `POST /refund` (from @nugen/payment-gateway) only
 *   touches Payment state. If the original order was paid using credits
 *   and/or a promo code, the package endpoint leaves those side effects
 *   intact: the user loses the credits permanently, the promo stays
 *   counted against the per-user / global cap, and the Order's
 *   paymentStatus stays 'succeeded' even after the money is returned.
 *   That's a real bug — the refund is half-implemented as a domain
 *   operation.
 *
 *   This route is the canonical "complete refund" endpoint. Sequence:
 *
 *     0. (irreversible) Call the package's processRefund — Stripe
 *        moves the money back to the customer. If this fails, no
 *        downstream work runs.
 *     1. (saga) Re-credit the user for the original creditApplied
 *        amount.
 *     2. (saga) Revoke the promo usage (delete usage row, decrement
 *        usageCount counter).
 *     3. (saga) Flip Order.paymentStatus to 'refunded' (full) or
 *        'partially_refunded' (partial).
 *
 *   If any of steps 1–3 fail, the saga rolls back the others.
 *   Important: the Stripe refund is NOT rolled back on saga failure
 *   (that would require issuing a new charge — a different operation).
 *   The saga restores DOMAIN consistency, not financial consistency.
 *   If the saga fails, ops will see a SagaCompensationError aggregating
 *   any compensation failures and a refund that succeeded at Stripe but
 *   may have left the domain partially restored — manual reconciliation
 *   territory, surfaced explicitly via logs.
 *
 *   v1 scope: full refunds only get the credit + promo restoration.
 *   Partial refunds run the saga only for order status flip; we do not
 *   try to proportionally restore credit or partially decrement promo
 *   usage. That's a v2 question and not worth the modeling complexity
 *   today (the vast majority of refunds are full).
 *
 *   The package-level POST /refund continues to exist for callers that
 *   want raw refund-without-domain-rollback (legacy compatibility,
 *   integration tests).
 */

import { Router, type Request, type Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import type { Model } from 'mongoose';
import {
  processRefund,
  type IPaymentDocument,
  type PaymentGateway,
  type IPaymentProvider,
} from '@nugen/payment-gateway';
import * as _auditLog from '@nugen/audit-log';
import type { CheckPermissionFn } from '@nugen/rbac';
import { getRequestId } from '../../lib/requestContext';
import { runSaga, type SagaStep } from '../../lib/saga';
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

interface AuthRequest extends Request {
  user?: { _id: string; userId: string; userType: number };
}

export interface RefundRouteDeps {
  PaymentModel: Model<IPaymentDocument>;
  OrderModel: Model<IOrderDocument2>;
  providers: Map<PaymentGateway, IPaymentProvider>;
  authenticate: () => import('express').RequestHandler;
  checkPermission: CheckPermissionFn;
  creditService: CreditServiceResult;
  promoCodeService: PromoCodeServiceResult;
}

const refundValidation = [
  param('paymentId').isMongoId(),
  body('reason').isString().trim().isLength({ min: 3, max: 500 }),
  body('idempotencyKey').isString().isLength({ min: 10, max: 128 }),
  body('amount').optional().isInt({ min: 1 }),
];

export function createRefundRoutes(deps: RefundRouteDeps): Router {
  const router = Router();
  const { PaymentModel, OrderModel, creditService, promoCodeService } = deps;

  const authMiddleware =
    typeof deps.authenticate === 'function' && deps.authenticate.length === 0
      ? (deps.authenticate as unknown as () => import('express').RequestHandler)()
      : deps.authenticate;
  router.use(authMiddleware);

  // ── POST /admin/payments/:paymentId/full-refund ─────────────────────────
  router.post(
    '/admin/payments/:paymentId/full-refund',
    deps.checkPermission('payments', 'update'),
    ...refundValidation,
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }

      const authReq = req as AuthRequest;
      const actorId = authReq.user?.userId ?? authReq.user?._id;
      const actorType = authReq.user?.userType;
      if (!actorId || actorType === undefined) {
        res.status(401).json({ status: 401, message: 'Authentication required' });
        return;
      }

      const { paymentId } = req.params;
      const { reason, idempotencyKey, amount } = req.body as {
        reason: string;
        idempotencyKey: string;
        amount?: number;
      };

      try {
        // Fetch the order BEFORE the irreversible Stripe call so we know
        // what to restore. If the payment doesn't have an associated
        // order we still let the package handle the refund — but the
        // domain saga is a no-op (nothing to restore).
        const paymentLookup = await PaymentModel.findById(paymentId).lean();
        if (!paymentLookup) {
          res.status(404).json({ status: 404, message: 'Payment not found' });
          return;
        }

        const order = await OrderModel.findById(paymentLookup.orderId);
        // If no order linked (rare — orphaned payment), skip the domain
        // saga entirely; the package handles its narrow Payment update.
        const hasOrder = order !== null;

        // ── Step 0 (irreversible): call the package refund. Stripe
        //    moves the money back. If this throws, no domain mutation
        //    has happened — safe to bubble up as a 500.
        const refundResult = await processRefund({
          paymentId,
          amount,
          reason,
          idempotencyKey,
          actorId,
          actorType,
        });

        // Decide whether this is a full refund (whole captured amount
        // returned). Only full refunds restore credit + promo; partial
        // refunds only flip the order status if needed.
        const isFullRefund = refundResult.payment.status === 'refunded';
        const userId = String(refundResult.payment.userId);

        // ── Steps 1–3 (saga): only run if we have an order to mutate.
        if (hasOrder) {
          const originalOrderSnapshot = {
            paymentStatus: order.paymentStatus,
          };

          // Idempotency guard. If this admin double-clicks the refund
          // button (or two operators race), processRefund's status guard
          // catches the second `payment.status === 'refunded'` call —
          // BUT a true concurrent race can still slip both through. If
          // we see the order is already in the target refunded state,
          // the saga has already run for this refund. Skip it; otherwise
          // we'd re-credit the user a second time (addCredit doesn't
          // dedupe on referenceId) and double-revoke the promo.
          const targetOrderStatus = isFullRefund ? 'refunded' : 'partially_refunded';
          if (order.paymentStatus === targetOrderStatus) {
            auditLog.log({
              actor: actorId,
              actorType: 'admin',
              action: 'refund',
              resource: 'payment',
              resourceId: paymentId,
              severity: 'warning',
              description: `Full-refund route: order ${order.orderNumber} already in "${targetOrderStatus}" state — saga skipped (idempotent retry / concurrent request)`,
            });
            res.status(200).json({
              status: 200,
              data: {
                paymentId: String(refundResult.payment._id),
                paymentNumber: refundResult.payment.paymentNumber,
                refund: {
                  refundId: refundResult.refundEntry.refundId,
                  amount: refundResult.refundEntry.amount,
                  status: refundResult.refundEntry.status,
                },
                totalRefunded: refundResult.payment.refundedAmount,
                paymentStatus: refundResult.payment.status,
                orderPaymentStatus: order.paymentStatus,
                domainRestored: false, // saga skipped — was already restored
                idempotentReplay: true,
              },
            });
            return;
          }

          const steps: SagaStep<void>[] = [];

          // Re-credit only if the order originally consumed credits AND
          // this is a full refund. Partial refund credit math (which
          // portion to restore) is intentionally out of scope for v1.
          const creditToRestore = order.creditApplied ?? 0;
          if (isFullRefund && creditToRestore > 0) {
            steps.push({
              name: 'reCreditUser',
              forward: async () => {
                await creditService.addCredit(
                  userId,
                  creditToRestore,
                  'refund_credit',
                  `Refund restoration for order ${order.orderNumber}: $${(creditToRestore / 100).toFixed(2)} credit returned`,
                  String(order._id),
                );
              },
              compensate: async () => {
                // Reverse the re-credit by deducting it again. Tied to
                // the same orderId so reconciliation can find the pair.
                await creditService.useCredit(userId, creditToRestore, String(order._id));
              },
            });
          }

          // Revoke promo only if the order originally used one AND this
          // is a full refund. Partial refunds keep the promo counted.
          const promoCode = order.promoCode;
          if (isFullRefund && promoCode && (order.discountAmount ?? 0) > 0) {
            steps.push({
              name: 'revokePromoCode',
              forward: async () => {
                await promoCodeService.revokePromoCode(promoCode, userId, String(order._id));
              },
              compensate: async () => {
                // Re-apply the promo to put the usage row + counter back.
                // Pass the original totalAmount so the discount math
                // matches what was originally recorded.
                await promoCodeService.applyPromoCode(
                  promoCode,
                  userId,
                  String(order._id),
                  order.totalAmount,
                );
              },
            });
          }

          // Always update order status (full or partial). Without this,
          // the order detail screen claims the order is paid even after
          // the user has their money back.
          steps.push({
            name: 'flipOrderStatus',
            forward: async () => {
              order.paymentStatus = isFullRefund ? 'refunded' : 'partially_refunded';
              await order.save();
            },
            compensate: async () => {
              order.paymentStatus = originalOrderSnapshot.paymentStatus;
              await order.save();
            },
          });

          await runSaga('refund.domainSync', steps, undefined);
        }

        auditLog.log({
          actor: actorId,
          actorType: 'admin',
          action: 'refund',
          resource: 'payment',
          resourceId: paymentId,
          severity: 'critical',
          description: `Full-refund route: ${refundResult.refundEntry.amount} cents on payment ${refundResult.payment.paymentNumber} (full=${isFullRefund}). Reason: ${reason}`,
        });

        res.status(200).json({
          status: 200,
          data: {
            paymentId: String(refundResult.payment._id),
            paymentNumber: refundResult.payment.paymentNumber,
            refund: {
              refundId: refundResult.refundEntry.refundId,
              amount: refundResult.refundEntry.amount,
              status: refundResult.refundEntry.status,
            },
            totalRefunded: refundResult.payment.refundedAmount,
            paymentStatus: refundResult.payment.status,
            orderPaymentStatus: hasOrder ? order.paymentStatus : null,
            domainRestored: hasOrder && isFullRefund,
          },
        });
      } catch (err) {
        const error = err as Error & {
          statusCode?: number;
          code?: string;
          compensationFailures?: unknown[];
        };

        // Audit on failure too. The success path logs every refund;
        // failures are MORE important to surface — a SagaCompensationError
        // means Stripe sent the money back but the domain rollback only
        // partially succeeded, leaving credits/promo in an inconsistent
        // state that needs manual reconciliation. Without this entry,
        // ops would have no audit trail for the broken refund.
        const isCompensationFailure =
          Array.isArray(error.compensationFailures) && error.compensationFailures.length > 0;
        auditLog.log({
          actor: actorId,
          actorType: 'admin',
          action: 'refund',
          resource: 'payment',
          resourceId: paymentId,
          severity: isCompensationFailure ? 'critical' : 'high',
          description: `Full-refund route FAILED on payment ${paymentId}: ${error.message}${
            isCompensationFailure
              ? ` — saga compensation also failed (${error.compensationFailures!.length} step(s)); MANUAL RECONCILIATION REQUIRED`
              : ''
          }. Reason: ${reason}`,
        });

        res.status(error.statusCode ?? 500).json({
          status: error.statusCode ?? 500,
          code: error.code,
          message: error.message,
        });
      }
    },
  );

  return router;
}
