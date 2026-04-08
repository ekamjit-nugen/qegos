import { Router, type Request, type Response, type RequestHandler } from 'express';
import type { Model } from 'mongoose';
import { AppError, asyncHandler } from '@nugen/error-handler';
import { validate } from '@nugen/validator';
// Fix for S-3.19: Removed @nugen/audit-log import — audit logging injected via deps
import type {
  IPaymentDocument,
  IWebhookEventDocument,
  IGatewayConfigDocument,
  IGatewayConfig,
  IPaymentProvider,
  PaymentGateway,
  AuthenticatedPaymentRequest,
} from '../types';
import { routePayment } from '../services/paymentRouter';
import { processStripeWebhook, processPayzooWebhook } from '../services/webhookProcessor';
import { processRefund } from '../services/refundService';
import {
  checkIdempotencyKey,
  storeIdempotencyResponse,
} from '../services/idempotencyService';
import { generatePaymentNumber, isValidTransition } from '../models/paymentModel';
import { stripeWebhookVerify } from '../middleware/stripeWebhookVerify';
import { payzooWebhookVerify } from '../middleware/payzooWebhookVerify';
import { maintenanceMode } from '../middleware/maintenanceMode';
import {
  createIntentValidation,
  capturePaymentValidation,
  refundPaymentValidation,
  getPaymentValidation,
  getOrderPaymentsValidation,
  updateConfigValidation,
  getPaymentLogsValidation,
  writeOffValidation,
  adjustInvoiceValidation,
} from '../validators/paymentValidators';

import type Stripe from 'stripe';

/** Fix for S-3.19: Audit log interface injected from consuming app */
export interface AuditLogDeps {
  log: (params: Record<string, unknown>) => Promise<void>;
  logFromRequest: (req: Request, params: Record<string, unknown>) => Promise<void>;
}

export interface PaymentRouteDeps {
  PaymentModel: Model<IPaymentDocument>;
  WebhookEventModel: Model<IWebhookEventDocument>;
  GatewayConfigModel: Model<IGatewayConfigDocument>;
  providers: Map<PaymentGateway, IPaymentProvider>;
  authenticate: () => RequestHandler;
  checkPermission: (resource: string, action: string) => RequestHandler;
  /** Fix for S-3.19: Injected audit logger instead of direct @nugen/audit-log import */
  auditLog?: AuditLogDeps;
}

/**
 * Create payment routes with injected dependencies.
 * Returns an Express Router with all 15 payment endpoints.
 */
export function createPaymentRoutes(deps: PaymentRouteDeps): Router {
  const router = Router();
  const {
    PaymentModel,
    GatewayConfigModel,
    providers,
    authenticate,
    checkPermission,
  } = deps;

  // Fix for S-3.19: Use injected audit log
  const auditLog = deps.auditLog;

  // Apply maintenance mode check to all routes
  router.use(maintenanceMode());

  // ─── 1. POST /intent — Create payment intent ──────────────────────────────
  router.post(
    '/intent',
    authenticate() as RequestHandler,
    checkPermission('payments', 'create') as RequestHandler,
    ...validate(createIntentValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedPaymentRequest;
      const { orderId, idempotencyKey, amount, currency, gateway } = req.body as {
        orderId: string;
        idempotencyKey: string;
        amount: number;
        currency?: string;
        gateway?: PaymentGateway;
      };

      // PAY-INV-01: Check idempotency
      const cached = await checkIdempotencyKey(idempotencyKey);
      if (cached) {
        res.status(cached.statusCode).json(cached.body);
        return;
      }

      // Also check the database for idempotency (hard guarantee)
      const existingPayment = await PaymentModel.findOne({ idempotencyKey }).lean();
      if (existingPayment) {
        const responseBody = {
          status: 200,
          data: {
            paymentId: existingPayment._id.toString(),
            gateway: existingPayment.gateway,
            status: existingPayment.status,
          },
        };
        res.status(200).json(responseBody);
        return;
      }

      // BIL-INV-06: Duplicate charge detection — same orderId within 5 min
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recentPayment = await PaymentModel.findOne({
        orderId,
        createdAt: { $gte: fiveMinAgo },
        status: { $nin: ['failed', 'cancelled'] },
      }).lean();

      if (recentPayment) {
        // Flag for review, do NOT auto-block — per BIL-INV-06
        await auditLog?.log({
          actor: authReq.user.userId,
          actorType: 'system',
          action: 'create',
          resource: 'payment',
          resourceId: recentPayment._id.toString(),
          description: `Duplicate charge detected: orderId ${orderId} has a recent payment within 5 min. Flagged for review.`,
          severity: 'critical',
        });
      }

      // Get gateway config
      const config = (await GatewayConfigModel.findOne()) ?? await GatewayConfigModel.create({
        primaryGateway: 'stripe',
        routingRule: 'primary_only',
      });

      // Generate payment number
      const paymentNumber = await generatePaymentNumber(PaymentModel);

      // Route the payment through the gateway abstraction layer
      const configObj = config.toObject() as unknown as IGatewayConfig;
      const intentResult = await routePayment(
        {
          amount,
          currency: currency ?? 'AUD',
          orderId,
          userId: authReq.user.userId,
          idempotencyKey,
          metadata: {
            paymentNumber,
          },
        },
        {
          ...configObj,
          // Allow explicit gateway override if provided and enabled
          primaryGateway: gateway ?? configObj.primaryGateway,
        },
        providers,
      );

      // Create payment record
      const payment = await PaymentModel.create({
        paymentNumber,
        orderId,
        userId: authReq.user.userId,
        gateway: intentResult.gateway,
        gatewayTxnId: intentResult.gatewayTxnId,
        idempotencyKey,
        amount,
        currency: currency ?? 'AUD',
        status: 'pending',
        metadata: {
          clientIp: req.ip,
          userAgent: req.headers['user-agent'],
          deviceType: (req.headers['x-device-type'] as 'mobile' | 'web') ?? 'web',
        },
      });

      // PAY-INV-09: Never expose raw gateway objects — transform response
      const responseBody = {
        status: 201,
        data: {
          paymentId: payment._id.toString(),
          paymentNumber: payment.paymentNumber,
          clientSecret: intentResult.clientSecret,
          gateway: intentResult.gateway,
          publishableKey: intentResult.publishableKey,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
        },
      };

      // Cache idempotency response
      await storeIdempotencyResponse(idempotencyKey, {
        statusCode: 201,
        body: responseBody,
        createdAt: Date.now(),
      });

      // PAY-INV-11: Audit log
      await auditLog?.logFromRequest(req, {
        action: 'create',
        resource: 'payment',
        resourceId: payment._id.toString(),
        resourceNumber: paymentNumber,
        description: `Payment intent created: ${paymentNumber}, ${intentResult.gateway}, ${amount} cents`,
        severity: 'critical',
      });

      res.status(201).json(responseBody);
    }),
  );

  // ─── 2. POST /capture — Capture authorized payment ────────────────────────
  router.post(
    '/capture',
    authenticate() as RequestHandler,
    checkPermission('payments', 'update') as RequestHandler,
    ...validate(capturePaymentValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { paymentId, idempotencyKey, amount } = req.body as {
        paymentId: string;
        idempotencyKey: string;
        amount?: number;
      };

      // PAY-INV-01: Idempotency check
      const cached = await checkIdempotencyKey(idempotencyKey);
      if (cached) {
        res.status(cached.statusCode).json(cached.body);
        return;
      }

      const payment = await PaymentModel.findById(paymentId);
      if (!payment) {
        throw AppError.notFound('Payment');
      }

      // PAY-INV-07: Validate status transition
      if (!isValidTransition(payment.status, 'captured')) {
        throw AppError.badRequest(
          `Payment cannot be captured in status "${payment.status}". Must be "authorised" or "requires_capture".`,
        );
      }

      const provider = providers.get(payment.gateway);
      if (!provider) {
        throw AppError.gatewayError(`Gateway "${payment.gateway}" is not available`);
      }

      const captureResult = await provider.capturePayment({
        gatewayTxnId: payment.gatewayTxnId,
        amount,
      });

      const previousStatus = payment.status;
      payment.status = 'captured';
      payment.capturedAmount = captureResult.capturedAmount;
      await payment.save();

      const responseBody = {
        status: 200,
        data: {
          paymentId: payment._id.toString(),
          paymentNumber: payment.paymentNumber,
          capturedAmount: payment.capturedAmount,
          status: payment.status,
        },
      };

      await storeIdempotencyResponse(idempotencyKey, {
        statusCode: 200,
        body: responseBody,
        createdAt: Date.now(),
      });

      // PAY-INV-11: Audit log
      await auditLog?.logFromRequest(req, {
        action: 'payment_capture',
        resource: 'payment',
        resourceId: payment._id.toString(),
        resourceNumber: payment.paymentNumber,
        changes: { status: { from: previousStatus, to: 'captured' } },
        description: `Payment captured: ${payment.paymentNumber}, ${captureResult.capturedAmount} cents`,
        severity: 'critical',
      });

      res.status(200).json(responseBody);
    }),
  );

  // ─── 3. POST /refund — Initiate refund ────────────────────────────────────
  router.post(
    '/refund',
    authenticate() as RequestHandler,
    checkPermission('payments', 'update') as RequestHandler,
    ...validate(refundPaymentValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedPaymentRequest;
      const { paymentId, amount, reason, idempotencyKey } = req.body as {
        paymentId: string;
        amount?: number;
        reason: string;
        idempotencyKey: string;
      };

      // PAY-INV-01: Idempotency check
      const cached = await checkIdempotencyKey(idempotencyKey);
      if (cached) {
        res.status(cached.statusCode).json(cached.body);
        return;
      }

      const result = await processRefund({
        paymentId,
        amount,
        reason,
        idempotencyKey,
        actorId: authReq.user.userId,
        actorType: authReq.user.userType,
      });

      const responseBody = {
        status: 200,
        data: {
          paymentId: result.payment._id.toString(),
          paymentNumber: result.payment.paymentNumber,
          refund: {
            refundId: result.refundEntry.refundId,
            amount: result.refundEntry.amount,
            status: result.refundEntry.status,
          },
          totalRefunded: result.payment.refundedAmount,
          paymentStatus: result.payment.status,
          requiredApproval: result.requiredApproval,
        },
      };

      await storeIdempotencyResponse(idempotencyKey, {
        statusCode: 200,
        body: responseBody,
        createdAt: Date.now(),
      });

      // PAY-INV-11: Audit log with severity=critical
      await auditLog?.logFromRequest(req, {
        action: 'refund',
        resource: 'payment',
        resourceId: result.payment._id.toString(),
        resourceNumber: result.payment.paymentNumber,
        changes: {
          refundedAmount: {
            from: result.payment.refundedAmount - result.refundEntry.amount,
            to: result.payment.refundedAmount,
          },
          status: {
            from: 'succeeded',
            to: result.payment.status,
          },
        },
        description: `Refund processed: ${result.refundEntry.amount} cents on ${result.payment.paymentNumber}. Reason: ${reason}`,
        severity: 'critical',
      });

      res.status(200).json(responseBody);
    }),
  );

  // ─── 4. GET /:id — Payment detail ─────────────────────────────────────────
  router.get(
    '/:id',
    authenticate() as RequestHandler,
    checkPermission('payments', 'read') as RequestHandler,
    ...validate(getPaymentValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedPaymentRequest;
      const { id } = req.params;

      const query: Record<string, unknown> = { _id: id };

      // Scope filter: clients can only see their own payments
      if (authReq.scopeFilter && Object.keys(authReq.scopeFilter).length > 0) {
        Object.assign(query, authReq.scopeFilter);
      }

      const payment = await PaymentModel.findOne(query).lean();
      if (!payment) {
        throw AppError.notFound('Payment');
      }

      // PAY-INV-09: Strip gateway internals
      res.status(200).json({
        status: 200,
        data: {
          paymentId: payment._id.toString(),
          paymentNumber: payment.paymentNumber,
          orderId: payment.orderId.toString(),
          gateway: payment.gateway,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          capturedAmount: payment.capturedAmount,
          refundedAmount: payment.refundedAmount,
          refunds: payment.refunds.map((r) => ({
            refundId: r.refundId,
            amount: r.amount,
            reason: r.reason,
            status: r.status,
            createdAt: r.createdAt,
            processedAt: r.processedAt,
          })),
          xeroSynced: payment.xeroSynced,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        },
      });
    }),
  );

  // ─── 5. GET /:id/status — Real-time gateway poll ──────────────────────────
  router.get(
    '/:id/status',
    authenticate() as RequestHandler,
    checkPermission('payments', 'read') as RequestHandler,
    ...validate(getPaymentValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedPaymentRequest;
      const { id } = req.params;

      const query: Record<string, unknown> = { _id: id };
      if (authReq.scopeFilter && Object.keys(authReq.scopeFilter).length > 0) {
        Object.assign(query, authReq.scopeFilter);
      }

      const payment = await PaymentModel.findOne(query);
      if (!payment) {
        throw AppError.notFound('Payment');
      }

      // Poll the gateway for real-time status
      const provider = providers.get(payment.gateway);
      if (!provider) {
        // Return DB status if provider unavailable
        res.status(200).json({
          status: 200,
          data: {
            paymentId: payment._id.toString(),
            status: payment.status,
            source: 'database',
          },
        });
        return;
      }

      try {
        const gatewayStatus = await provider.getPaymentStatus(payment.gatewayTxnId);
        res.status(200).json({
          status: 200,
          data: {
            paymentId: payment._id.toString(),
            status: payment.status,
            gatewayStatus: gatewayStatus.status,
            source: 'gateway',
          },
        });
      } catch {
        // Return DB status on gateway error
        res.status(200).json({
          status: 200,
          data: {
            paymentId: payment._id.toString(),
            status: payment.status,
            source: 'database',
          },
        });
      }
    }),
  );

  // ─── 6. GET /order/:orderId — All payments for order ──────────────────────
  router.get(
    '/order/:orderId',
    authenticate() as RequestHandler,
    checkPermission('payments', 'read') as RequestHandler,
    ...validate(getOrderPaymentsValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedPaymentRequest;
      const { orderId } = req.params;

      const query: Record<string, unknown> = { orderId };
      if (authReq.scopeFilter && Object.keys(authReq.scopeFilter).length > 0) {
        Object.assign(query, authReq.scopeFilter);
      }

      const payments = await PaymentModel.find(query)
        .sort({ createdAt: -1 })
        .lean();

      // PAY-INV-09: Strip gateway internals
      res.status(200).json({
        status: 200,
        data: payments.map((p) => ({
          paymentId: p._id.toString(),
          paymentNumber: p.paymentNumber,
          gateway: p.gateway,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          capturedAmount: p.capturedAmount,
          refundedAmount: p.refundedAmount,
          createdAt: p.createdAt,
        })),
      });
    }),
  );

  // ─── 7. POST /webhooks/stripe — Stripe webhook (public, signature verified) ─
  // NOTE: This route MUST be mounted with express.raw() body parser
  router.post(
    '/webhooks/stripe',
    stripeWebhookVerify(),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const event = (req as Request & { stripeEvent: Stripe.Event }).stripeEvent;

      const result = await processStripeWebhook(
        event.id,
        event.type,
        event as unknown as Record<string, unknown>,
      );

      if (result.duplicate) {
        // PAY-INV-03: Return 200 for duplicates without reprocessing
        res.status(200).json({ received: true, duplicate: true });
        return;
      }

      res.status(200).json({ received: true, processed: result.processed });
    }),
  );

  // ─── 8. POST /webhooks/payzoo — Payzoo webhook (public, HMAC verified) ────
  router.post(
    '/webhooks/payzoo',
    payzooWebhookVerify(),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const payload = req.body as Record<string, unknown>;
      const eventId = payload.eventId as string;
      const eventType = payload.eventType as string;

      if (!eventId || !eventType) {
        throw AppError.badRequest('Missing eventId or eventType in webhook payload');
      }

      const result = await processPayzooWebhook(eventId, eventType, payload);

      if (result.duplicate) {
        res.status(200).json({ received: true, duplicate: true });
        return;
      }

      res.status(200).json({ received: true, processed: result.processed });
    }),
  );

  // ─── 9. GET /config — Current gateway config ──────────────────────────────
  router.get(
    '/config',
    authenticate() as RequestHandler,
    checkPermission('payments', 'read') as RequestHandler,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const config = (await GatewayConfigModel.findOne()) ?? await GatewayConfigModel.create({
        primaryGateway: 'stripe',
        routingRule: 'primary_only',
      });

      res.status(200).json({
        status: 200,
        data: {
          primaryGateway: config.primaryGateway,
          routingRule: config.routingRule,
          amountThreshold: config.amountThreshold,
          stripeEnabled: config.stripeEnabled,
          payzooEnabled: config.payzooEnabled,
          fallbackTimeoutMs: config.fallbackTimeoutMs,
          maintenanceMode: config.maintenanceMode,
          maintenanceMessage: config.maintenanceMessage,
        },
      });
    }),
  );

  // ─── 10. PUT /config — Update gateway config (Super Admin only) ────────────
  router.put(
    '/config',
    authenticate() as RequestHandler,
    checkPermission('payments', 'update') as RequestHandler,
    ...validate(updateConfigValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedPaymentRequest;

      // Super admin check (userType 0)
      if (authReq.user.userType !== 0) {
        throw AppError.forbidden('Only Super Admin can update payment gateway configuration');
      }

      const updates = req.body as Record<string, unknown>;
      let config = await GatewayConfigModel.findOne();
      if (!config) {
        config = new GatewayConfigModel({
          primaryGateway: 'stripe',
          routingRule: 'primary_only',
        });
      }

      // Apply updates
      const allowedFields = [
        'primaryGateway', 'routingRule', 'amountThreshold',
        'stripeEnabled', 'payzooEnabled', 'fallbackTimeoutMs',
        'maintenanceMode', 'maintenanceMessage',
      ];

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          const oldValue = (config as unknown as Record<string, unknown>)[field];
          changes[field] = { from: oldValue, to: updates[field] };
          (config as unknown as Record<string, unknown>)[field] = updates[field];
        }
      }

      config.updatedBy = authReq.user.userId as unknown as import('mongoose').Types.ObjectId;
      await config.save();

      // PAY-INV-11: Critical audit log for config changes
      await auditLog?.logFromRequest(req, {
        action: 'config_change',
        resource: 'payment_gateway_config',
        resourceId: config._id.toString(),
        changes,
        description: `Payment gateway config updated by Super Admin`,
        severity: 'critical',
      });

      res.status(200).json({
        status: 200,
        data: {
          primaryGateway: config.primaryGateway,
          routingRule: config.routingRule,
          amountThreshold: config.amountThreshold,
          stripeEnabled: config.stripeEnabled,
          payzooEnabled: config.payzooEnabled,
          fallbackTimeoutMs: config.fallbackTimeoutMs,
          maintenanceMode: config.maintenanceMode,
          maintenanceMessage: config.maintenanceMessage,
        },
        message: 'Payment gateway configuration updated',
      });
    }),
  );

  // ─── 11. POST /config/test — Test gateway connectivity ─────────────────────
  router.post(
    '/config/test',
    authenticate() as RequestHandler,
    checkPermission('payments', 'read') as RequestHandler,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const results: Record<string, boolean> = {};

      for (const [name, provider] of providers) {
        try {
          results[name] = await provider.testConnection();
        } catch {
          results[name] = false;
        }
      }

      res.status(200).json({
        status: 200,
        data: results,
      });
    }),
  );

  // ─── 12. GET /logs — Transaction log with filters ──────────────────────────
  router.get(
    '/logs',
    authenticate() as RequestHandler,
    checkPermission('payments', 'read') as RequestHandler,
    ...validate(getPaymentLogsValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const {
        page = 1,
        limit = 20,
        gateway,
        status,
        dateFrom,
        dateTo,
        amountMin,
        amountMax,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query as {
        page?: number;
        limit?: number;
        gateway?: string;
        status?: string;
        dateFrom?: string;
        dateTo?: string;
        amountMin?: number;
        amountMax?: number;
        sortBy?: string;
        sortOrder?: string;
      };

      const filter: Record<string, unknown> = {};

      if (gateway) filter.gateway = gateway;
      if (status) filter.status = status;

      if (dateFrom || dateTo) {
        const dateFilter: Record<string, Date> = {};
        if (dateFrom) dateFilter.$gte = new Date(dateFrom);
        if (dateTo) dateFilter.$lte = new Date(dateTo);
        filter.createdAt = dateFilter;
      }

      if (amountMin !== undefined || amountMax !== undefined) {
        const amountFilter: Record<string, number> = {};
        if (amountMin !== undefined) amountFilter.$gte = amountMin;
        if (amountMax !== undefined) amountFilter.$lte = amountMax;
        filter.amount = amountFilter;
      }

      const pageNum = Number(page);
      const limitNum = Number(limit);
      const skip = (pageNum - 1) * limitNum;
      const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

      const [payments, total] = await Promise.all([
        PaymentModel.find(filter)
          .sort(sort)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        PaymentModel.countDocuments(filter),
      ]);

      res.status(200).json({
        status: 200,
        data: payments.map((p) => ({
          paymentId: p._id.toString(),
          paymentNumber: p.paymentNumber,
          orderId: p.orderId.toString(),
          userId: p.userId.toString(),
          gateway: p.gateway,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          capturedAmount: p.capturedAmount,
          refundedAmount: p.refundedAmount,
          failureCode: p.failureCode,
          failureMessage: p.failureMessage,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasNext: pageNum * limitNum < total,
          hasPrev: pageNum > 1,
        },
      });
    }),
  );

  // ─── 13. GET /stats — Gateway comparison stats ─────────────────────────────
  router.get(
    '/stats',
    authenticate() as RequestHandler,
    checkPermission('payments', 'read') as RequestHandler,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const pipeline = [
        {
          $group: {
            _id: '$gateway',
            totalCount: { $sum: 1 },
            successCount: {
              $sum: { $cond: [{ $eq: ['$status', 'succeeded'] }, 1, 0] },
            },
            failedCount: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
            },
            totalAmount: { $sum: '$amount' },
            totalCaptured: { $sum: '$capturedAmount' },
            totalRefunded: { $sum: '$refundedAmount' },
          },
        },
      ];

      const stats = await PaymentModel.aggregate(pipeline);

      const formattedStats = stats.map((s: {
        _id: string;
        totalCount: number;
        successCount: number;
        failedCount: number;
        totalAmount: number;
        totalCaptured: number;
        totalRefunded: number;
      }) => ({
        gateway: s._id,
        totalTransactions: s.totalCount,
        successCount: s.successCount,
        failedCount: s.failedCount,
        successRate: s.totalCount > 0
          ? Math.round((s.successCount / s.totalCount) * 10000) / 100
          : 0,
        totalAmount: s.totalAmount,
        totalCaptured: s.totalCaptured,
        totalRefunded: s.totalRefunded,
        netRevenue: s.totalCaptured - s.totalRefunded,
      }));

      res.status(200).json({
        status: 200,
        data: formattedStats,
      });
    }),
  );

  // ─── 14. POST /write-off — Write off unpaid payment ────────────────────────
  router.post(
    '/write-off',
    authenticate() as RequestHandler,
    checkPermission('payments', 'update') as RequestHandler,
    ...validate(writeOffValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedPaymentRequest;
      const { paymentId, reason, contactAttempts, contactLog } = req.body as {
        paymentId: string;
        reason: string;
        contactAttempts: number;
        contactLog: string;
      };

      const payment = await PaymentModel.findById(paymentId);
      if (!payment) {
        throw AppError.notFound('Payment');
      }

      // BIL-INV-05: Must be outstanding 90+ days
      const daysSinceCreation = Math.floor(
        (Date.now() - payment.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysSinceCreation < 90) {
        throw AppError.badRequest(
          `Payment is only ${daysSinceCreation} days old. Write-off requires 90+ days outstanding.`,
        );
      }

      // BIL-INV-05: Must have 2+ contact attempts (validated in middleware, double-check here)
      if (contactAttempts < 2) {
        throw AppError.badRequest('Write-off requires at least 2 documented contact attempts');
      }

      // BIL-INV-05: Admin approval (userType 0 or 1)
      if (authReq.user.userType > 1) {
        throw AppError.forbidden('Write-off requires admin approval');
      }

      // Mark as cancelled (written off)
      if (!isValidTransition(payment.status, 'cancelled')) {
        throw AppError.badRequest(
          `Payment in status "${payment.status}" cannot be written off`,
        );
      }

      const previousStatus = payment.status;
      payment.status = 'cancelled';
      payment.failureMessage = `Written off: ${reason}`;
      await payment.save();

      // PAY-INV-11: Critical audit log
      await auditLog?.logFromRequest(req, {
        action: 'void',
        resource: 'payment',
        resourceId: payment._id.toString(),
        resourceNumber: payment.paymentNumber,
        changes: { status: { from: previousStatus, to: 'cancelled' } },
        description: `Payment written off: ${payment.paymentNumber}. Reason: ${reason}. Days outstanding: ${daysSinceCreation}. Contact attempts: ${contactAttempts}. Log: ${contactLog}`,
        severity: 'critical',
      });

      res.status(200).json({
        status: 200,
        data: {
          paymentId: payment._id.toString(),
          paymentNumber: payment.paymentNumber,
          status: payment.status,
          writeOffReason: reason,
        },
        message: 'Payment written off successfully',
      });
    }),
  );

  // ─── 15. POST /orders/:id/adjust-invoice — Placeholder for Phase 2 ────────
  router.post(
    '/orders/:id/adjust-invoice',
    authenticate() as RequestHandler,
    checkPermission('payments', 'update') as RequestHandler,
    ...validate(adjustInvoiceValidation()),
    asyncHandler(async (req: Request, _res: Response): Promise<void> => {
      const { id: _orderId } = req.params;

      // BIL-INV-02: Invoice adjustment void + recreate is a Phase 2 feature
      // that requires @nugen/xero-connector integration.
      throw AppError.badRequest(
        'Invoice adjustment is not yet available. This feature requires Xero integration (Phase 2).',
      );
    }),
  );

  return router;
}
