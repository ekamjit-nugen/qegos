/**
 * Staff-facing "Collect Payment on Behalf of Client" routes.
 *
 * Mirrors the client-portal Pay Now flow (apps/api/src/modules/client-portal/payOrder.routes.ts)
 * but is scoped for staff users (Staff, Senior Staff, Office Manager, Admin).
 *
 * The order's stored `userId` is used as the payment's owner — staff cannot
 * pay against their own user record. RBAC requires `payments:create`.
 */

import { Router, type Request, type Response, type RequestHandler } from 'express';
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
} from '@nugen/payment-gateway';
import { getRequestId } from '../../lib/requestContext';
import type { IOrderDocument2 } from './order.types';
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
  user?: { _id: string; userId: string; userType?: number };
}

export interface CollectPaymentRouteDeps {
  OrderModel: Model<IOrderDocument2>;
  PaymentModel: Model<IPaymentDocument>;
  GatewayConfigModel: Model<IGatewayConfigDocument>;
  providers: Map<PaymentGateway, IPaymentProvider>;
  authenticate: () => RequestHandler;
  checkPermission: (resource: string, action: string) => RequestHandler;
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
  body('gateway').optional().isIn(['stripe', 'payzoo']),
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

        // Full credit coverage — apply and mark paid, no gateway call
        if (breakdown.finalAmount === 0) {
          if (breakdown.creditApplied > 0 && creditService) {
            await creditService.useCredit(clientUserId, breakdown.creditApplied, String(order._id));
          }
          if (breakdown.promoCode && promoCodeService && breakdown.discountAmount > 0) {
            await promoCodeService.applyPromoCode(
              breakdown.promoCode,
              clientUserId,
              String(order._id),
              breakdown.totalAmount,
            );
          }
          order.discountAmount = breakdown.discountAmount;
          order.promoCode = breakdown.promoCode;
          order.creditApplied = breakdown.creditApplied;
          order.finalAmount = 0;
          order.paymentStatus = 'succeeded';
          await order.save();

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

        const config =
          (await GatewayConfigModel.findOne()) ??
          (await GatewayConfigModel.create({
            primaryGateway: 'stripe',
            routingRule: 'primary_only',
          }));
        const configObj = config.toObject() as unknown as IGatewayConfig;

        const paymentNumber = await generatePaymentNumber(PaymentModel);

        const intentResult = await routePayment(
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
          { ...configObj, primaryGateway: gateway ?? configObj.primaryGateway },
          providers,
        );

        const payment = await PaymentModel.create({
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

        // Provisionally apply promo + credits to the order
        if (breakdown.creditApplied > 0 && creditService) {
          await creditService.useCredit(clientUserId, breakdown.creditApplied, String(order._id));
        }
        if (breakdown.promoCode && promoCodeService && breakdown.discountAmount > 0) {
          await promoCodeService.applyPromoCode(
            breakdown.promoCode,
            clientUserId,
            String(order._id),
            breakdown.totalAmount,
          );
        }
        order.discountAmount = breakdown.discountAmount;
        order.promoCode = breakdown.promoCode;
        order.creditApplied = breakdown.creditApplied;
        order.finalAmount = breakdown.finalAmount;
        await order.save();

        auditLog.log({
          actor: staffUserId,
          actorType: 'staff',
          action: 'create',
          resource: 'payment',
          resourceId: String(payment._id),
          severity: 'info',
          description: `Staff initiated payment for order ${order.orderNumber} (${breakdown.finalAmount} cents) on behalf of client ${clientUserId}`,
        });

        res.status(201).json({
          status: 201,
          data: {
            paymentId: String(payment._id),
            paymentNumber: payment.paymentNumber,
            clientSecret: intentResult.clientSecret,
            publishableKey: intentResult.publishableKey,
            gateway: intentResult.gateway,
            amount: payment.amount,
            currency: payment.currency,
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
