import type { Request, Response } from 'express';
import * as auth from '@nugen/auth';
import * as rbac from '@nugen/rbac';
import * as auditLog from '@nugen/audit-log';
import * as paymentGateway from '@nugen/payment-gateway';
import { initRateLimiter, createAuthLimiters } from '@nugen/rate-limiter';
import { loadConfig, getConfig } from './config/env';
import { connectDatabase, getConnection, disconnectDatabase } from './database/connection';
import { createRedisClient, disconnectRedis } from './database/redis';
import { createApp, finalizeApp } from './app';
import { createUserModel } from './modules/user/user.model';
import { createUserRoutes } from './modules/user/user.routes';
import { createTaxRuleConfigModel } from './modules/tax-rules/taxRule.model';
import { createTaxRuleRoutes } from './modules/tax-rules/taxRule.routes';
import { seedTaxRules } from './modules/tax-rules/taxRule.seed';
import { createBillingDisputeModel } from './modules/billing/billingDispute.model';
import { createBillingDisputeRoutes } from './modules/billing/billingDispute.routes';
import type { IUserDocument } from './modules/user/user.types';

// Phase 3: Lead & Order Core + Review Pipeline
import { createLeadModel } from './modules/lead-management/lead.model';
import { createLeadActivityModel } from './modules/lead-management/leadActivity.model';
import { createLeadReminderModel } from './modules/lead-management/leadReminder.model';
import { createLeadRoutes } from './modules/lead-management/lead.routes';
import { createOrderModel } from './modules/order-management/order.model';
import { createSalesModel, seedSalesCatalogue } from './modules/order-management/sales.model';
import { createOrderRoutes, createSalesRoutes } from './modules/order-management/order.routes';
import { createReviewAssignmentModel } from './modules/review-pipeline/reviewAssignment.model';
import { createReviewRoutes } from './modules/review-pipeline/review.routes';

async function bootstrap(): Promise<void> {
  // 1. Load and validate environment
  const config = loadConfig();

  // 2. Create Express app
  const app = createApp();

  // 3. Connect to databases
  await connectDatabase();
  const connection = getConnection();

  const redisClient = createRedisClient();
  try {
    await redisClient.connect();
  } catch (err) {
    console.warn('Redis connection failed, continuing without Redis:', err); // eslint-disable-line no-console
  }

  // 4. Initialize Tier 1 packages

  // Rate limiter
  initRateLimiter(redisClient);
  const authLimiters = createAuthLimiters();

  // RBAC (creates Role + PermissionSnapshot models)
  const { RoleModel, PermissionSnapshotModel } = rbac.init(connection, redisClient);

  // User model (composed from plugins)
  const UserModel = createUserModel(connection);

  // Auth (creates OTP model, initializes all services)
  const authConfig: auth.AuthConfig = {
    jwtAccessSecret: config.JWT_ACCESS_SECRET,
    jwtRefreshSecret: config.JWT_REFRESH_SECRET,
    jwtAccessExpiry: config.JWT_ACCESS_EXPIRY,
    jwtRefreshExpiry: config.JWT_REFRESH_EXPIRY,
    maxSessions: 5,
    otpExpiry: 300, // 5 minutes
    otpLength: 6,
    bcryptRounds: 12,
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSpecial: false,
    },
    phoneRegex: /^\+61\d{9}$/,
    mfaIssuer: config.MFA_ISSUER,
  };

  auth.init(authConfig, connection, UserModel as never);

  // Audit log
  const { AuditLogModel } = auditLog.init(connection);

  // Tax rule config model
  const TaxRuleConfigModel = createTaxRuleConfigModel(connection);

  // Payment gateway (Phase 1)
  const { PaymentModel, WebhookEventModel, GatewayConfigModel, providers } =
    paymentGateway.init(connection, redisClient, {
      stripeSecretKey: config.STRIPE_SECRET_KEY,
      stripeWebhookSecret: config.STRIPE_WEBHOOK_SECRET,
      payzooApiKey: config.PAYZOO_API_KEY,
      payzooApiSecret: config.PAYZOO_API_SECRET,
      payzooBaseUrl: config.PAYZOO_BASE_URL,
      payzooWebhookSecret: config.PAYZOO_WEBHOOK_SECRET,
    });

  // Billing dispute model (QEGOS Tier 2)
  const BillingDisputeModel = createBillingDisputeModel(connection);

  // Phase 3: Lead & Order Core + Review Pipeline models
  const LeadModel = createLeadModel(connection);
  const LeadActivityModel = createLeadActivityModel(connection);
  const LeadReminderModel = createLeadReminderModel(connection);
  const OrderModel = createOrderModel(connection);
  const SalesModel = createSalesModel(connection);
  const ReviewAssignmentModel = createReviewAssignmentModel(connection);

  // 5. Seed data
  await rbac.seedRoles(RoleModel);

  // Seed tax rules (need a system user — use first super_admin or create placeholder ID)
  const systemUser = await UserModel.findOne({ userType: 0 });
  if (systemUser) {
    await seedTaxRules(TaxRuleConfigModel, systemUser._id);
  }

  // Seed Sales catalogue with Australian services (Phase 3)
  await seedSalesCatalogue(SalesModel);

  // 6. Create routes
  const authRouter = auth.createAuthRoutes({
    UserModel: UserModel as never,
    config: authConfig,
    authLimiters,
  });

  const rbacRouter = rbac.createRbacRoutes({
    RoleModel,
    PermissionSnapshotModel,
    UserModel: UserModel as never,
    authenticate: auth.authenticate,
  });

  const auditRouter = auditLog.createAuditRoutes({
    AuditLogModel,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
  });

  const userRouter = createUserRoutes({
    UserModel,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
  });

  const taxRuleRouter = createTaxRuleRoutes({
    TaxRuleConfigModel,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
  });

  const paymentRouter = paymentGateway.createPaymentRoutes({
    PaymentModel,
    WebhookEventModel,
    GatewayConfigModel,
    providers,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
  });

  const billingDisputeRouter = createBillingDisputeRoutes({
    BillingDisputeModel,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
  });

  // Phase 3 routes
  const leadRouter = createLeadRoutes({
    LeadModel,
    LeadActivityModel,
    LeadReminderModel,
    connection,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
  });

  const orderRouter = createOrderRoutes({
    OrderModel,
    SalesModel,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
  });

  const salesRouter = createSalesRoutes({
    SalesModel,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
  });

  const reviewRouter = createReviewRoutes({
    ReviewAssignmentModel,
    OrderModel: OrderModel as never,
    UserModel: UserModel as never,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
  });

  // Deep health check
  async function deepHealthCheck(_req: Request, res: Response): Promise<void> {
    const checks: Record<string, string> = {};

    // MongoDB
    try {
      if (connection.readyState === 1) {
        checks.mongodb = 'ok';
      } else {
        checks.mongodb = 'disconnected';
      }
    } catch {
      checks.mongodb = 'error';
    }

    // Redis
    try {
      await redisClient.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'disconnected';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok');
    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    });
  }

  // 7. Finalize app (mount routes, error handler)
  finalizeApp(app, {
    authRouter,
    rbacRouter,
    auditRouter,
    userRouter,
    taxRuleRouter,
    paymentRouter,
    billingDisputeRouter,
    leadRouter,
    orderRouter,
    salesRouter,
    reviewRouter,
  }, deepHealthCheck);

  // 8. Start server
  const port = config.PORT;
  const server = app.listen(port, () => {
    console.warn(`QEGOS API running on port ${port} [${config.NODE_ENV}]`); // eslint-disable-line no-console
  });

  // 9. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.warn(`${signal} received. Shutting down gracefully...`); // eslint-disable-line no-console
    server.close(async () => {
      await disconnectDatabase();
      await disconnectRedis();
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout'); // eslint-disable-line no-console
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err); // eslint-disable-line no-console
  process.exit(1);
});
