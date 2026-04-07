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
import { createCounterModel } from './database/counter.model';
import { createAutomationHandlers } from './modules/lead-management/lead.automation';
import { Queue, Worker, type Job } from 'bullmq';

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

  // Fix for B-3.1: Atomic counter model
  const CounterModel = createCounterModel(connection);

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

  // Fix for S-3.19: Inject auditLog into payment routes
  const paymentRouter = paymentGateway.createPaymentRoutes({
    PaymentModel,
    WebhookEventModel,
    GatewayConfigModel,
    providers,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
    auditLog: {
      log: auditLog.log,
      logFromRequest: auditLog.logFromRequest,
    },
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
    // Fix for B-3.1, T-3.11: Pass CounterModel and injected models
    CounterModel,
    UserModel: UserModel as never,
    OrderModel: OrderModel as never,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
  });

  const orderRouter = createOrderRoutes({
    OrderModel,
    SalesModel,
    // Fix for S-3.1, B-3.1: Pass ReviewAssignmentModel and CounterModel
    ReviewAssignmentModel: ReviewAssignmentModel as never,
    CounterModel,
    UserModel: UserModel as never,
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

  // Fix for B-3.4, T-3.2, G-3.2: Register BullMQ automation jobs
  const automationHandlers = createAutomationHandlers({
    LeadModel,
    LeadActivityModel,
    LeadReminderModel,
    recalculateScore: createLeadService({
      LeadModel, LeadActivityModel, LeadReminderModel, connection, CounterModel,
      UserModel: UserModel as never, OrderModel: OrderModel as never,
    }).calculateScore,
  });

  const redisConnectionOpts = {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || undefined,
  };

  const automationQueue = new Queue('lead-automation', { connection: redisConnectionOpts });

  // Register repeatable jobs
  const repeatableJobs: Array<{ name: string; pattern: string }> = [
    { name: 'autoAssign', pattern: '*/5 * * * *' },       // every 5 minutes
    { name: 'staleLeadAlert', pattern: '0 * * * *' },     // every hour
    { name: 'autoDormant', pattern: '0 2 * * *' },        // daily at 2am
    { name: 'followUpEscalation', pattern: '*/30 * * * *' }, // every 30 minutes
    { name: 'overdueMarker', pattern: '*/15 * * * *' },   // every 15 minutes
    { name: 'reEngagementFlag', pattern: '0 3 * * *' },   // daily at 3am
  ];

  for (const job of repeatableJobs) {
    await automationQueue.add(job.name, {}, {
      repeat: { pattern: job.pattern },
      removeOnComplete: 100,
      removeOnFail: 50,
    });
  }

  // Worker to process automation jobs
  const automationWorker = new Worker(
    'lead-automation',
    async (job: Job): Promise<void> => {
      switch (job.name) {
        case 'autoAssign':
          await automationHandlers.autoAssignNewLead();
          break;
        case 'staleLeadAlert':
          await automationHandlers.staleLeadAlert();
          break;
        case 'autoDormant':
          await automationHandlers.autoDormant();
          break;
        case 'followUpEscalation':
          await automationHandlers.followUpEscalation();
          break;
        case 'overdueMarker':
          await automationHandlers.overdueMarker();
          break;
        case 'reEngagementFlag':
          await automationHandlers.reEngagementFlag();
          break;
        default:
          // On-demand jobs like scoreRecalculation
          if (job.name === 'scoreRecalculation' && job.data.leadId) {
            await automationHandlers.scoreRecalculation(job.data.leadId as string);
          }
      }
    },
    { connection: redisConnectionOpts },
  );

  automationWorker.on('failed', (job, err) => {
    console.warn(`[AUTOMATION] Job ${job?.name} failed:`, err); // eslint-disable-line no-console
  });

  // 8. Start server
  const port = config.PORT;
  const server = app.listen(port, () => {
    console.warn(`QEGOS API running on port ${port} [${config.NODE_ENV}]`); // eslint-disable-line no-console
  });

  // 9. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.warn(`${signal} received. Shutting down gracefully...`); // eslint-disable-line no-console
    server.close(async () => {
      await automationWorker.close();
      await automationQueue.close();
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
