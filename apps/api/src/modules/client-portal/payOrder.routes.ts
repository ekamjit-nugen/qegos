/**
 * Client-facing "Pay Now" routes for unpaid orders.
 *
 * Workflow:
 *   1. Client calls POST /portal/orders/:id/pricing  → preview breakdown
 *      (apply promo + credits, see what they'd actually pay)
 *   2. Client calls POST /portal/orders/:id/pay      → applies pricing,
 *      creates Payment intent via configured gateway (Stripe), returns
 *      clientSecret + publishableKey for the frontend SDK to confirm.
 *
 * Both branches are saga-wrapped (GAP-C03):
 *
 *   - Full-credit branch: useCredit → applyPromoCode → markOrderPaid.
 *     A failure rolls each completed step back synchronously.
 *
 *   - Partial-Stripe branch: createStripeIntent → persistPayment →
 *     useCredit → applyPromoCode → updateOrder. A mid-flight failure
 *     cancels the Stripe intent (releases the held funds + fires the
 *     `payment_intent.canceled` webhook), refunds the credit, revokes
 *     the promo, and reverts the order's provisional fields. The
 *     `Payment.domainCompensated` marker is set so the
 *     paymentCompensation.listener (which also fires on the cancel
 *     webhook) does not double-compensate.
 *
 * The webhook listener still backs us up for abandoned checkouts that
 * complete the route happily but never confirm at Stripe — see
 * apps/api/src/modules/order-management/paymentCompensation.listener.ts.
 */

import { Router, type Request, type Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import type { Model } from 'mongoose';
import * as _auditLog from '@nugen/audit-log';
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
import type { IOrderDocument2 } from '../order-management/order.types';
import type { PromoCodeServiceResult } from '../promo-code/promoCode.service';
import type { CreditServiceResult } from '../credit/credit.service';

const auditLog = {
  log: (params: Record<string, unknown>): void => {
    _auditLog.log({ ...params, requestId: getRequestId() } as never).catch(() => {
      // fire-and-forget
    });
  },
};

interface AuthRequest extends Request {
  user?: { _id: string; userId: string };
}

export interface PayOrderRouteDeps {
  OrderModel: Model<IOrderDocument2>;
  PaymentModel: Model<IPaymentDocument>;
  GatewayConfigModel: Model<IGatewayConfigDocument>;
  providers: Map<PaymentGateway, IPaymentProvider>;
  authenticate: () => import('express').RequestHandler;
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
  userId: string,
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
      userId,
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
    creditBalance = await creditService.getBalance(userId);
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
  body('gateway').optional().isIn(['stripe', 'payzoo']),
];

export function createPayOrderRoutes(deps: PayOrderRouteDeps): Router {
  const router = Router();
  const {
    OrderModel,
    PaymentModel,
    GatewayConfigModel,
    providers,
    promoCodeService,
    creditService,
  } = deps;

  const authMiddleware =
    typeof deps.authenticate === 'function' && deps.authenticate.length === 0
      ? (deps.authenticate as unknown as () => import('express').RequestHandler)()
      : deps.authenticate;
  router.use(authMiddleware);

  // ── POST /orders/:id/pricing — preview breakdown ─────────────────────────
  router.post(
    '/orders/:id/pricing',
    ...pricingValidation,
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }

      const authReq = req as AuthRequest;
      const userId = authReq.user?.userId ?? authReq.user?._id;
      if (!userId) {
        res.status(401).json({ status: 401, message: 'Authentication required' });
        return;
      }

      try {
        const order = await OrderModel.findOne({
          _id: req.params.id,
          userId,
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
          userId,
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

  // ── POST /orders/:id/pay — create payment intent ────────────────────────
  router.post(
    '/orders/:id/pay',
    ...payValidation,
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }

      const authReq = req as AuthRequest;
      const userId = authReq.user?.userId ?? authReq.user?._id;
      if (!userId) {
        res.status(401).json({ status: 401, message: 'Authentication required' });
        return;
      }

      try {
        const order = await OrderModel.findOne({
          _id: req.params.id,
          userId,
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

        const { promoCode, useCredits, idempotencyKey, gateway } = req.body as {
          promoCode?: string;
          useCredits?: boolean;
          idempotencyKey: string;
          gateway?: PaymentGateway;
        };

        // 1. Compute pricing
        const breakdown = await computePricing(
          order,
          userId,
          promoCode,
          Boolean(useCredits),
          promoCodeService,
          creditService,
        );

        // If full coverage by credits (rare but possible), short-circuit.
        // No gateway call — but we still mutate three things (credits,
        // promo usage, order). Wrap in a saga so a partial failure
        // doesn't leave the user with credits gone but order unpaid.
        if (breakdown.finalAmount === 0) {
          // Snapshot the original order state for the order-step compensation.
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
                await creditService.useCredit(userId, breakdown.creditApplied, String(order._id));
              },
              compensate: async () => {
                // Refund the deducted credit by adding it back as a
                // refund_credit transaction tied to the same order.
                await creditService.addCredit(
                  userId,
                  breakdown.creditApplied,
                  'refund_credit',
                  `Saga compensation: pay-now full-credit failed for order ${order.orderNumber}`,
                  String(order._id),
                );
              },
            });
          }

          if (breakdown.promoCode && promoCodeService && breakdown.discountAmount > 0) {
            const promoCode = breakdown.promoCode;
            steps.push({
              name: 'applyPromoCode',
              forward: async () => {
                await promoCodeService.applyPromoCode(
                  promoCode,
                  userId,
                  String(order._id),
                  breakdown.totalAmount,
                );
              },
              compensate: async () => {
                await promoCodeService.revokePromoCode(promoCode, userId, String(order._id));
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

          await runSaga('payOrder.fullCreditCoverage', steps, undefined);

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

        // 2. Re-use existing payment record if one exists for this idempotency key
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

        // 3. Get gateway config + allocate payment number BEFORE the saga.
        //    These are read-only / sequence allocations; if the saga later
        //    rolls back we don't need to "release" them — the next pay
        //    attempt grabs the next number.
        const config =
          (await GatewayConfigModel.findOne()) ??
          (await GatewayConfigModel.create({
            primaryGateway: 'stripe',
            routingRule: 'primary_only',
          }));
        const configObj = config.toObject() as unknown as IGatewayConfig;
        const paymentNumber = await generatePaymentNumber(PaymentModel);
        const effectiveGateway = gateway ?? configObj.primaryGateway;

        // 4. Snapshot original order state for the order-step compensation.
        const originalOrderSnapshot = {
          discountAmount: order.discountAmount,
          promoCode: order.promoCode,
          creditApplied: order.creditApplied,
          finalAmount: order.finalAmount,
        };

        // 5. Build the partial-Stripe saga. Closures share state across
        //    forward + compensate callbacks. Order is:
        //      createStripeIntent → persistPayment → useCredit?
        //      → applyPromoCode? → updateOrder
        //    A failure at any step rolls back all completed steps in
        //    reverse. The Stripe intent is cancelled at the gateway,
        //    which fires `payment_intent.canceled` — the
        //    paymentCompensation.listener checks `Payment.domainCompensated`
        //    (set by the persistPayment compensation below) and skips.
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
                  userId,
                  idempotencyKey,
                  metadata: { paymentNumber, orderNumber: order.orderNumber },
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
                userId,
                gateway: intentResult.gateway,
                gatewayTxnId: intentResult.gatewayTxnId,
                idempotencyKey,
                amount: breakdown.finalAmount,
                currency: 'AUD',
                status: 'pending',
                metadata: {
                  clientIp: req.ip,
                  userAgent: req.headers['user-agent'],
                  deviceType: (req.headers['x-device-type'] as 'mobile' | 'web') ?? 'web',
                },
              });
            },
            compensate: async () => {
              if (!payment) {
                return;
              }
              // Mark the payment cancelled and flip the domain-compensation
              // flag so the webhook listener (which fires on the
              // `payment_intent.canceled` event from the createStripeIntent
              // compensation step above) doesn't double-compensate.
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
              await creditService.useCredit(userId, breakdown.creditApplied, String(order._id));
            },
            compensate: async () => {
              await creditService.addCredit(
                userId,
                breakdown.creditApplied,
                'refund_credit',
                `Saga compensation: pay-now partial-Stripe failed for order ${order.orderNumber}`,
                String(order._id),
              );
            },
          });
        }

        if (breakdown.promoCode && promoCodeService && breakdown.discountAmount > 0) {
          const promoCode = breakdown.promoCode;
          steps.push({
            name: 'applyPromoCode',
            forward: async () => {
              await promoCodeService.applyPromoCode(
                promoCode,
                userId,
                String(order._id),
                breakdown.totalAmount,
              );
            },
            compensate: async () => {
              await promoCodeService.revokePromoCode(promoCode, userId, String(order._id));
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
              // Save failed — restore the in-memory order to the
              // pre-mutation snapshot so the calling code (and the
              // saga's compensation pass for prior steps) doesn't see
              // dirty fields. The DB was never written, so the
              // snapshot IS the truth.
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

        await runSaga('payOrder.partialStripe', steps, undefined);

        // After a successful saga both refs are populated; null-check to
        // satisfy TS narrowing (closures can't tell us this).
        if (!intentResult || !payment) {
          throw new Error('payOrder.partialStripe saga succeeded but state is missing');
        }
        const finalIntent: PaymentIntentResult = intentResult;
        const finalPayment: IPaymentDocument = payment;

        auditLog.log({
          actor: userId,
          actorType: 'client',
          action: 'create',
          resource: 'payment',
          resourceId: String(finalPayment._id),
          severity: 'info',
          description: `Pay Now intent for order ${order.orderNumber} (${breakdown.finalAmount} cents)`,
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
