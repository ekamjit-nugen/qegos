/**
 * Staff-facing "Collect Payment on Behalf of Client" routes.
 *
 * Mirrors the client-portal Pay Now flow (apps/api/src/modules/client-portal/payOrder.routes.ts)
 * but is scoped for staff users (Staff, Senior Staff, Office Manager, Admin).
 *
 * The order's stored `userId` is used as the payment's owner — staff cannot
 * pay against their own user record. RBAC requires `payments:create`.
 *
 * Both branches are saga-wrapped (GAP-C03), matching Pay Now exactly:
 *
 *   - Full-credit branch: useCredit → applyPromoCode → markOrderPaid.
 *
 *   - Partial-Stripe branch: createStripeIntent → persistPayment →
 *     useCredit → applyPromoCode → updateOrder. A mid-flight failure
 *     cancels the Stripe intent (releases held funds + fires the
 *     `payment_intent.canceled` webhook), refunds credit, revokes promo,
 *     and reverts the order's provisional fields. The
 *     `Payment.domainCompensated` marker prevents the
 *     paymentCompensation.listener (which fires on the same cancel
 *     webhook) from double-compensating.
 */

import { Router, type Request, type Response, type RequestHandler } from 'express';
import { body, param, validationResult } from 'express-validator';
import type { Model } from 'mongoose';
import * as _auditLog from '@nugen/audit-log';
import type { CheckPermissionFn } from '@nugen/rbac';
import {
  routePayment,
  generatePaymentNumber,
  type IPaymentDocument,
  type IGatewayConfigDocument,
  type IGatewayConfig,
  type IPaymentProvider,
  type PaymentGateway,
  type PaymentIntentResult,
} from '@nugen/payment-gateway';
import { getRequestId } from '../../lib/requestContext';
import { runSaga, type SagaStep } from '../../lib/saga';
import type { PromoCodeServiceResult } from '../promo-code/promoCode.service';
import type { CreditServiceResult } from '../credit/credit.service';
import type { IOrderDocument2 } from './order.types';

const auditLog = {
  log: (params: Record<string, unknown>): void => {
    _auditLog.log({ ...params, requestId: getRequestId() } as never).catch(() => {
      // fire-and-forget
    });
  },
};

interface AuthRequest extends Request {
  user?: { _id: string; userId: string; userType?: number };
}

export interface CollectPaymentRouteDeps {
  OrderModel: Model<IOrderDocument2>;
  PaymentModel: Model<IPaymentDocument>;
  GatewayConfigModel: Model<IGatewayConfigDocument>;
  providers: Map<PaymentGateway, IPaymentProvider>;
  authenticate: () => RequestHandler;
  checkPermission: CheckPermissionFn;
  promoCodeService?: PromoCodeServiceResult;
  creditService?: CreditServiceResult;
}

interface PricingBreakdown {
  totalAmount: number;
  discountAmount: number;
  promoCode?: string;
  promoCodeId?: string;
  promoMessage?: string;
  creditApplied: number;
  creditBalance: number;
  finalAmount: number;
}

async function computePricing(
  order: IOrderDocument2,
  clientUserId: string,
  promoCodeInput: string | undefined,
  useCredits: boolean,
  promoCodeService?: PromoCodeServiceResult,
  creditService?: CreditServiceResult,
): Promise<PricingBreakdown> {
  const totalAmount = order.totalAmount;
  let discountAmount = 0;
  let promoCode: string | undefined;
  let promoCodeId: string | undefined;
  let promoMessage: string | undefined;

  if (promoCodeInput && promoCodeService) {
    const validation = await promoCodeService.validatePromoCode(
      promoCodeInput,
      clientUserId,
      totalAmount,
      order.lineItems?.[0]?.salesId ? String(order.lineItems[0].salesId) : undefined,
    );
    if (validation.valid) {
      discountAmount = validation.calculatedDiscount;
      promoCode = promoCodeInput.toUpperCase();
      promoCodeId = validation.promoCodeId ? String(validation.promoCodeId) : undefined;
    } else {
      promoMessage = validation.message;
    }
  }

  const afterDiscount = Math.max(totalAmount - discountAmount, 0);

  let creditBalance = 0;
  let creditApplied = 0;
  if (creditService) {
    creditBalance = await creditService.getBalance(clientUserId);
    if (useCredits && afterDiscount > 0) {
      creditApplied = Math.min(creditBalance, afterDiscount);
    }
  }

  const finalAmount = Math.max(afterDiscount - creditApplied, 0);

  return {
    totalAmount,
    discountAmount,
    promoCode,
    promoCodeId,
    promoMessage,
    creditApplied,
    creditBalance,
    finalAmount,
  };
}

const pricingValidation = [
  param('id').isMongoId(),
  body('promoCode').optional().isString().trim(),
  body('useCredits').optional().isBoolean(),
];

const payValidation = [
  ...pricingValidation,
  body('idempotencyKey').isString().isLength({ min: 10, max: 128 }),
  body('gateway').optional().isIn(['stripe', 'payroo']),
];

export function createCollectPaymentRoutes(deps: CollectPaymentRouteDeps): Router {
  const router = Router();
  const {
    OrderModel,
    PaymentModel,
    GatewayConfigModel,
    providers,
    authenticate,
    checkPermission,
    promoCodeService,
    creditService,
  } = deps;

  // ── POST /orders/:id/collect-pricing — staff preview ────────────────────
  router.post(
    '/:id/collect-pricing',
    authenticate(),
    checkPermission('payments', 'read'),
    ...pricingValidation,
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }

      try {
        const order = await OrderModel.findOne({
          _id: req.params.id,
          isDeleted: { $ne: true },
        });
        if (!order) {
          res.status(404).json({ status: 404, message: 'Order not found' });
          return;
        }
        if (order.paymentStatus === 'succeeded') {
          res.status(409).json({ status: 409, message: 'Order is already paid' });
          return;
        }

        const { promoCode, useCredits } = req.body as {
          promoCode?: string;
          useCredits?: boolean;
        };

        const breakdown = await computePricing(
          order,
          String(order.userId),
          promoCode,
          Boolean(useCredits),
          promoCodeService,
          creditService,
        );

        res.status(200).json({ status: 200, data: breakdown });
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        res.status(error.statusCode ?? 500).json({
          status: error.statusCode ?? 500,
          message: error.message,
        });
      }
    },
  );

  // ── POST /orders/:id/collect-payment — staff creates intent ─────────────
  router.post(
    '/:id/collect-payment',
    authenticate(),
    checkPermission('payments', 'create'),
    ...payValidation,
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }

      const authReq = req as AuthRequest;
      const staffUserId = authReq.user?.userId ?? authReq.user?._id ?? 'system';

      try {
        const order = await OrderModel.findOne({
          _id: req.params.id,
          isDeleted: { $ne: true },
        });
        if (!order) {
          res.status(404).json({ status: 404, message: 'Order not found' });
          return;
        }
        if (order.paymentStatus === 'succeeded') {
          res.status(409).json({ status: 409, message: 'Order is already paid' });
          return;
        }

        const clientUserId = String(order.userId);
        const { promoCode, useCredits, idempotencyKey, gateway } = req.body as {
          promoCode?: string;
          useCredits?: boolean;
          idempotencyKey: string;
          gateway?: PaymentGateway;
        };

        const breakdown = await computePricing(
          order,
          clientUserId,
          promoCode,
          Boolean(useCredits),
          promoCodeService,
          creditService,
        );

        // Full credit coverage — apply and mark paid, no gateway call.
        // Same saga shape as the client-side Pay Now full-credit branch
        // (apps/api/src/modules/client-portal/payOrder.routes.ts). Without
        // a saga: if applyPromoCode or order.save throws after useCredit
        // succeeded, the client's credits are gone but the order is still
        // unpaid — the staff would then re-collect, double-charging the
        // client. This is the same hazard GAP-C03 caught for Pay Now;
        // the Collect Payment route was a copy-paste with the same hole.
        if (breakdown.finalAmount === 0) {
          // Snapshot original order state so the order-step compensation
          // can restore exactly what was there before.
          const originalOrderSnapshot = {
            discountAmount: order.discountAmount,
            promoCode: order.promoCode,
            creditApplied: order.creditApplied,
            finalAmount: order.finalAmount,
            paymentStatus: order.paymentStatus,
          };

          const steps: SagaStep<void>[] = [];

          if (breakdown.creditApplied > 0 && creditService) {
            steps.push({
              name: 'useCredit',
              forward: async () => {
                await creditService.useCredit(
                  clientUserId,
                  breakdown.creditApplied,
                  String(order._id),
                );
              },
              compensate: async () => {
                // Refund the deducted credit by adding it back as a
                // refund_credit transaction tied to the same order.
                await creditService.addCredit(
                  clientUserId,
                  breakdown.creditApplied,
                  'refund_credit',
                  `Saga compensation: collect-payment full-credit failed for order ${order.orderNumber}`,
                  String(order._id),
                );
              },
            });
          }

          if (breakdown.promoCode && promoCodeService && breakdown.discountAmount > 0) {
            const promoCodeForSaga = breakdown.promoCode;
            steps.push({
              name: 'applyPromoCode',
              forward: async () => {
                await promoCodeService.applyPromoCode(
                  promoCodeForSaga,
                  clientUserId,
                  String(order._id),
                  breakdown.totalAmount,
                );
              },
              compensate: async () => {
                await promoCodeService.revokePromoCode(
                  promoCodeForSaga,
                  clientUserId,
                  String(order._id),
                );
              },
            });
          }

          steps.push({
            name: 'markOrderPaid',
            forward: async () => {
              order.discountAmount = breakdown.discountAmount;
              order.promoCode = breakdown.promoCode;
              order.creditApplied = breakdown.creditApplied;
              order.finalAmount = 0;
              order.paymentStatus = 'succeeded';
              await order.save();
            },
            compensate: async () => {
              order.discountAmount = originalOrderSnapshot.discountAmount;
              order.promoCode = originalOrderSnapshot.promoCode;
              order.creditApplied = originalOrderSnapshot.creditApplied;
              order.finalAmount = originalOrderSnapshot.finalAmount;
              order.paymentStatus = originalOrderSnapshot.paymentStatus;
              await order.save();
            },
          });

          // Metadata for the reconciliation queue if any compensation
          // fails. clientUserId is the order owner (whose credits/promo
          // got touched); staffUserId is the actor that initiated the
          // collect-payment call (relevant for accountability).
          await runSaga('collectPayment.fullCreditCoverage', steps, undefined, {
            orderId: String(order._id),
            orderNumber: order.orderNumber,
            userId: clientUserId,
            staffUserId,
            creditApplied: breakdown.creditApplied,
            discountAmount: breakdown.discountAmount,
            totalAmount: breakdown.totalAmount,
            promoCode: breakdown.promoCode,
            idempotencyKey,
          });

          auditLog.log({
            actor: staffUserId,
            actorType: 'staff',
            action: 'create',
            resource: 'payment',
            resourceId: String(order._id),
            severity: 'info',
            description: `Staff collected payment via credits for order ${order.orderNumber}`,
          });

          res.status(200).json({
            status: 200,
            data: {
              fullyCoveredByCredits: true,
              orderId: String(order._id),
              breakdown,
            },
          });
          return;
        }

        // Idempotency reuse
        const existing = await PaymentModel.findOne({ idempotencyKey }).lean();
        if (existing) {
          res.status(200).json({
            status: 200,
            data: {
              paymentId: String(existing._id),
              status: existing.status,
              amount: existing.amount,
            },
          });
          return;
        }

        // Gateway config + payment number allocated BEFORE the saga.
        // These are read/sequence operations; if the saga rolls back we
        // don't need to release them.
        const config =
          (await GatewayConfigModel.findOne()) ??
          (await GatewayConfigModel.create({
            primaryGateway: 'stripe',
            routingRule: 'primary_only',
          }));
        const configObj = config.toObject() as unknown as IGatewayConfig;
        const paymentNumber = await generatePaymentNumber(PaymentModel);
        const effectiveGateway = gateway ?? configObj.primaryGateway;

        // Snapshot original order state for the order-step compensation.
        const originalOrderSnapshot = {
          discountAmount: order.discountAmount,
          promoCode: order.promoCode,
          creditApplied: order.creditApplied,
          finalAmount: order.finalAmount,
        };

        // Build the partial-Stripe saga. Mirror of payOrder.partialStripe
        // (apps/api/src/modules/client-portal/payOrder.routes.ts) — same
        // step order, same compensations, same domainCompensated guard
        // against the listener double-compensating from the
        // payment_intent.canceled webhook fired by the createStripeIntent
        // compensation step.
        let intentResult: PaymentIntentResult | null = null;
        let payment: IPaymentDocument | null = null;

        const steps: SagaStep<void>[] = [
          {
            name: 'createStripeIntent',
            forward: async () => {
              intentResult = await routePayment(
                {
                  amount: breakdown.finalAmount,
                  currency: 'AUD',
                  orderId: String(order._id),
                  userId: clientUserId,
                  idempotencyKey,
                  metadata: {
                    paymentNumber,
                    orderNumber: order.orderNumber,
                    collectedBy: staffUserId,
                  },
                },
                { ...configObj, primaryGateway: effectiveGateway },
                providers,
              );
            },
            compensate: async () => {
              if (!intentResult) {
                return;
              }
              const provider = providers.get(intentResult.gateway);
              if (!provider) {
                return;
              }
              await provider.cancelPayment({
                gatewayTxnId: intentResult.gatewayTxnId,
                reason: 'abandoned',
              });
            },
          },
          {
            name: 'persistPayment',
            forward: async () => {
              if (!intentResult) {
                throw new Error('intentResult missing before persistPayment');
              }
              payment = await PaymentModel.create({
                paymentNumber,
                orderId: order._id,
                userId: clientUserId,
                gateway: intentResult.gateway,
                gatewayTxnId: intentResult.gatewayTxnId,
                idempotencyKey,
                amount: breakdown.finalAmount,
                currency: 'AUD',
                status: 'pending',
                metadata: {
                  clientIp: req.ip,
                  userAgent: req.headers['user-agent'],
                  deviceType: 'web',
                  collectedBy: staffUserId,
                },
              });
            },
            compensate: async () => {
              if (!payment) {
                return;
              }
              payment.status = 'cancelled';
              payment.domainCompensated = true;
              payment.domainCompensatedAt = new Date();
              await payment.save();
            },
          },
        ];

        if (breakdown.creditApplied > 0 && creditService) {
          steps.push({
            name: 'useCredit',
            forward: async () => {
              await creditService.useCredit(
                clientUserId,
                breakdown.creditApplied,
                String(order._id),
              );
            },
            compensate: async () => {
              await creditService.addCredit(
                clientUserId,
                breakdown.creditApplied,
                'refund_credit',
                `Saga compensation: collect-payment partial-Stripe failed for order ${order.orderNumber}`,
                String(order._id),
              );
            },
          });
        }

        if (breakdown.promoCode && promoCodeService && breakdown.discountAmount > 0) {
          const promoCodeForSaga = breakdown.promoCode;
          steps.push({
            name: 'applyPromoCode',
            forward: async () => {
              await promoCodeService.applyPromoCode(
                promoCodeForSaga,
                clientUserId,
                String(order._id),
                breakdown.totalAmount,
              );
            },
            compensate: async () => {
              await promoCodeService.revokePromoCode(
                promoCodeForSaga,
                clientUserId,
                String(order._id),
              );
            },
          });
        }

        steps.push({
          name: 'updateOrder',
          forward: async () => {
            order.discountAmount = breakdown.discountAmount;
            order.promoCode = breakdown.promoCode;
            order.creditApplied = breakdown.creditApplied;
            order.finalAmount = breakdown.finalAmount;
            try {
              await order.save();
            } catch (saveErr) {
              // Save failed — restore in-memory order so the saga's
              // compensation pass for prior steps (and any caller code)
              // doesn't see dirty fields. DB was never written.
              order.discountAmount = originalOrderSnapshot.discountAmount;
              order.promoCode = originalOrderSnapshot.promoCode;
              order.creditApplied = originalOrderSnapshot.creditApplied;
              order.finalAmount = originalOrderSnapshot.finalAmount;
              throw saveErr;
            }
          },
          compensate: async () => {
            order.discountAmount = originalOrderSnapshot.discountAmount;
            order.promoCode = originalOrderSnapshot.promoCode;
            order.creditApplied = originalOrderSnapshot.creditApplied;
            order.finalAmount = originalOrderSnapshot.finalAmount;
            await order.save();
          },
        });

        // Metadata for the reconciliation queue. Mirrors the Pay Now
        // partial-Stripe shape, plus staffUserId so support knows which
        // staff member initiated the collection.
        await runSaga('collectPayment.partialStripe', steps, undefined, {
          orderId: String(order._id),
          orderNumber: order.orderNumber,
          userId: clientUserId,
          staffUserId,
          paymentNumber,
          gateway,
          creditApplied: breakdown.creditApplied,
          discountAmount: breakdown.discountAmount,
          finalAmount: breakdown.finalAmount,
          totalAmount: breakdown.totalAmount,
          promoCode: breakdown.promoCode,
          idempotencyKey,
        });

        if (!intentResult || !payment) {
          throw new Error('collectPayment.partialStripe saga succeeded but state is missing');
        }
        const finalIntent: PaymentIntentResult = intentResult;
        const finalPayment: IPaymentDocument = payment;

        auditLog.log({
          actor: staffUserId,
          actorType: 'staff',
          action: 'create',
          resource: 'payment',
          resourceId: String(finalPayment._id),
          severity: 'info',
          description: `Staff initiated payment for order ${order.orderNumber} (${breakdown.finalAmount} cents) on behalf of client ${clientUserId}`,
        });

        res.status(201).json({
          status: 201,
          data: {
            paymentId: String(finalPayment._id),
            paymentNumber: finalPayment.paymentNumber,
            clientSecret: finalIntent.clientSecret,
            publishableKey: finalIntent.publishableKey,
            gateway: finalIntent.gateway,
            amount: finalPayment.amount,
            currency: finalPayment.currency,
            breakdown,
          },
        });
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

  return router;
}
