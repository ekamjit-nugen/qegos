import { createServer as createHttpServer } from 'http';
import type { Request, Response } from 'express';
import * as auth from '@nugen/auth';
import * as rbac from '@nugen/rbac';
import * as auditLog from '@nugen/audit-log';
import * as paymentGateway from '@nugen/payment-gateway';
import { setErrorLogger } from '@nugen/error-handler';
import { initRateLimiter, createAuthLimiters } from '@nugen/rate-limiter';
import { loadConfig } from './config/env';
import { connectDatabase, getConnection, disconnectDatabase } from './database/connection';
import { ensurePerformanceIndexes } from './database/ensureIndexes';
import { createRedisClient, disconnectRedis } from './database/redis';
import { createApp, finalizeApp } from './app';
import { logger } from './lib/logger';
import { createUserModel } from './modules/user/user.model';
import { createUserRoutes } from './modules/user/user.routes';
import { createTaxRuleConfigModel } from './modules/tax-rules/taxRule.model';
import { createTaxRuleRoutes } from './modules/tax-rules/taxRule.routes';
import { seedTaxRules } from './modules/tax-rules/taxRule.seed';

// Phase 4: Tax Engine (enhanced calculator, estimates, results, amendments)
import { createTaxRuleConfigModelV2 } from './modules/tax-engine/taxRuleConfig.model';
import { createTaxEstimateLogModel } from './modules/tax-engine/taxEstimateLog.model';
import { createTaxReturnResultModel } from './modules/tax-engine/taxReturnResult.model';
import { createTaxEngineRoutes } from './modules/tax-engine/taxEngine.routes';
import { seedTaxEngineRules } from './modules/tax-engine/taxEngine.seed';
import { createBillingDisputeModel } from './modules/billing/billingDispute.model';
import { createBillingDisputeRoutes } from './modules/billing/billingDispute.routes';

// Phase 3: Lead & Order Core + Review Pipeline
import { createLeadModel } from './modules/lead-management/lead.model';
import { createLeadActivityModel } from './modules/lead-management/leadActivity.model';
import { createLeadReminderModel } from './modules/lead-management/leadReminder.model';
import { createLeadRoutes } from './modules/lead-management/lead.routes';
import { createLeadService } from './modules/lead-management/lead.service';
import { createOrderModel } from './modules/order-management/order.model';
import { createSalesModel, seedSalesCatalogue } from './modules/order-management/sales.model';
import { createOrderRoutes, createSalesRoutes } from './modules/order-management/order.routes';
import { createReviewAssignmentModel } from './modules/review-pipeline/reviewAssignment.model';
import { createReviewRoutes } from './modules/review-pipeline/review.routes';

// Form Mapping — dynamic client intake forms (authored per salesItem × FY)
import { createFormMappingModel } from './modules/form-mapping/formMapping.model';
import { createFormMappingVersionModel } from './modules/form-mapping/formMappingVersion.model';
import { createFormMappingRoutes } from './modules/form-mapping/formMapping.routes';

// Consent Form — client intake with AES-256-GCM field-level encryption
import { createConsentFormModel } from './modules/consent-form/consentForm.model';
import { createConsentFormRoutes } from './modules/consent-form/consentForm.routes';

import { createCounterModel } from './database/counter.model';
import { createAutomationHandlers } from './modules/lead-management/lead.automation';
import { Queue, Worker, type Job } from 'bullmq';

// Phase 5: Broadcast Engine
import * as broadcastEngine from '@nugen/broadcast-engine';

// Phase 6: Client Portal & Vault
import * as fileStorage from '@nugen/file-storage';
import { createPortalRoutes } from './modules/client-portal/portal.routes';
import { createFormFillRoutes } from './modules/client-portal/formFill.routes';
import { createPayOrderRoutes } from './modules/client-portal/payOrder.routes';
import { createCollectPaymentRoutes } from './modules/order-management/collectPayment.routes';
import { createFormDraftModel } from './modules/client-portal/formDraft.model';
import { createAppointmentBookingRoutes } from './modules/client-portal/appointmentBooking.routes';
import { hardDeleteExpiredDocuments } from './modules/client-portal/portal.service';
import { reconcileStorageUsage } from '@nugen/file-storage';

// Phase 7: Communication Suite
import * as chatEngine from '@nugen/chat-engine';
import * as supportTickets from '@nugen/support-tickets';
import * as whatsappConnector from '@nugen/whatsapp-connector';

// Notification Engine
import * as notificationEngine from '@nugen/notification-engine';

// Analytics Engine
import * as analyticsEngine from '@nugen/analytics-engine';

// Appointment Scheduling
import { createAppointmentModel, createStaffAvailabilityModel } from './modules/appointment-scheduling/appointment.model';
import { createAppointmentRoutes, processAppointmentReminders, markNoShows } from './modules/appointment-scheduling/appointment.routes';

// Staff Workload Balancing
import { createWorkloadRoutes, getWorkloadService } from './modules/staff-workload/workload.routes';

// Document Management & Signing
import { createDocumentRoutes, createZohoWebhookRoute } from './modules/document-management/document.routes';

// Phase 2: Xero Integration
import * as xeroConnector from '@nugen/xero-connector';
import { DEFAULT_XERO_SCOPES } from '@nugen/xero-connector';

// Settings
import { createSettingModel, seedDefaultSettings } from './modules/settings/settings.model';
import { createSettingsRoutes } from './modules/settings/settings.routes';

// Promo Code & Credits
import { createPromoCodeModel, createPromoCodeUsageModel } from './modules/promo-code/promoCode.model';
import { createPromoCodeRoutes } from './modules/promo-code/promoCode.routes';
import { createPromoCodeService } from './modules/promo-code/promoCode.service';
import { createCreditTransactionModel } from './modules/credit/credit.model';
import { createCreditRoutes } from './modules/credit/credit.routes';
import { createCreditService } from './modules/credit/credit.service';

// Phase 8: Engagement Modules
import { createReferralModel, createReferralConfigModel } from './modules/referral-engine/referral.model';
import { createReferralRoutes, expireStaleReferrals, expireCreditRewards } from './modules/referral-engine/referral.routes';
import { createTaxDeadlineModel, createDeadlineReminderModel } from './modules/tax-calendar/taxCalendar.model';
import { createCalendarRoutes, processReminders as processDeadlineReminders } from './modules/tax-calendar/taxCalendar.routes';
import { createReviewModel } from './modules/reputation-mgmt/review.model';
import { createReviewRoutes as createReputationRoutes, sendReviewReminders } from './modules/reputation-mgmt/review.routes';

// Privacy Act 1988 Compliance (GAP-C01/C02)
import * as dataLifecycle from '@nugen/data-lifecycle';
import type { ModelFieldConfig } from '@nugen/data-lifecycle';
import { createPrivacyRoutes } from './modules/privacy/privacy.routes';
import { cleanupExpiredExports, enforceRetentionPolicies } from '@nugen/data-lifecycle';

async function bootstrap(): Promise<void> {
  // 1. Load and validate environment
  const config = loadConfig();

  // 1b. Initialize structured logger and wire to error handler
  if (config.NODE_ENV === 'production') {
    logger.setLevel('info');
  } else {
    logger.setLevel('debug');
  }
  setErrorLogger(logger);

  // 2. Create Express app
  const app = createApp();

  // 3. Connect to databases
  await connectDatabase();
  const connection = getConnection();

  const redisClient = createRedisClient();
  try {
    await redisClient.connect();
  } catch (err) {
    logger.warn('Redis connection failed, continuing without Redis', { error: (err as Error).message });
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

  // Tax rule config model (Phase 0 — legacy)
  const TaxRuleConfigModel = createTaxRuleConfigModel(connection);

  // Phase 4: Tax engine models (enhanced)
  const TaxRuleConfigModelV2 = createTaxRuleConfigModelV2(connection);
  const TaxEstimateLogModel = createTaxEstimateLogModel(connection);
  const TaxReturnResultModel = createTaxReturnResultModel(connection);

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

  // Form Mapping models
  const FormMappingModel = createFormMappingModel(connection);
  const FormMappingVersionModel = createFormMappingVersionModel(connection);

  // Consent Form model (sensitive fields encrypted with AES-256-GCM)
  const ConsentFormModel = createConsentFormModel(connection);

  // Phase 5: Broadcast Engine
  const {
    CampaignModel: BroadcastCampaignModel,
    TemplateModel: BroadcastTemplateModel,
    MessageModel: BroadcastMessageModel,
    OptOutModel: BroadcastOptOutModel,
    ConsentModel: BroadcastConsentModel,
    providers: broadcastProviders,
  } = broadcastEngine.init(connection, redisClient, {
    twilioAccountSid: config.TWILIO_ACCOUNT_SID,
    twilioAuthToken: config.TWILIO_AUTH_TOKEN,
    twilioPhoneNumber: config.TWILIO_PHONE_NUMBER,
    sesRegion: config.AWS_SES_REGION,
    sesAccessKeyId: config.AWS_SES_ACCESS_KEY_ID,
    sesSecretAccessKey: config.AWS_SES_SECRET_ACCESS_KEY,
    sesFromEmail: config.AWS_SES_FROM_EMAIL,
    whatsappApiToken: config.WHATSAPP_API_TOKEN,
    whatsappPhoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
    businessName: config.BUSINESS_NAME,
    businessAbn: config.BUSINESS_ABN,
    unsubscribeBaseUrl: config.UNSUBSCRIBE_BASE_URL,
  }, {
    LeadModel: LeadModel as never,
    UserModel: UserModel as never,
  });

  // Phase 6: File Storage & Client Portal
  const {
    VaultDocumentModel,
    TaxYearSummaryModel,
  } = fileStorage.init(connection, {
    s3Bucket: config.S3_BUCKET ?? 'qegos-vault-dev',
    s3QuarantineBucket: config.S3_QUARANTINE_BUCKET ?? 'qegos-quarantine-dev',
    s3Region: config.S3_REGION ?? config.AWS_SES_REGION ?? 'ap-southeast-2',
    s3AccessKeyId: config.S3_ACCESS_KEY_ID ?? config.AWS_SES_ACCESS_KEY_ID ?? '',
    s3SecretAccessKey: config.S3_SECRET_ACCESS_KEY ?? config.AWS_SES_SECRET_ACCESS_KEY ?? '',
    clamavHost: config.CLAMAV_HOST,
    clamavPort: config.CLAMAV_PORT,
  }, {
    UserModel: UserModel as never,
  });

  // Phase 7: Communication Suite
  const {
    ConversationModel: ChatConversationModel,
    MessageModel: ChatMessageModel,
    CannedResponseModel,
  } = chatEngine.init(connection, {
    encryptionKey: config.ENCRYPTION_KEY,
  });

  const {
    TicketModel: SupportTicketModel,
  } = supportTickets.init(connection, {}, {
    CounterModel: CounterModel as never,
  });

  const {
    ConfigModel: WhatsAppConfigModel,
    MessageModel: WhatsAppMessageModel,
  } = whatsappConnector.init(connection, {
    accessToken: config.WHATSAPP_API_TOKEN,
    phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
    webhookVerifyToken: config.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  });

  // Phase 2: Xero Integration — Models
  const xeroConfig: xeroConnector.XeroConnectorConfig = {
    xeroClientId: config.XERO_CLIENT_ID ?? '',
    xeroClientSecret: config.XERO_CLIENT_SECRET ?? '',
    xeroRedirectUri: config.XERO_REDIRECT_URI ?? `http://localhost:${config.PORT}/api/${config.API_VERSION}/xero/callback`,
    xeroScopes: DEFAULT_XERO_SCOPES,
    encryptionKey: config.ENCRYPTION_KEY,
    webhookKey: config.XERO_WEBHOOK_KEY,
  };

  const {
    XeroConfigModel,
    XeroSyncLogModel,
  } = xeroConnector.init(connection, redisClient, xeroConfig);

  // Notification Engine
  const {
    NotificationModel,
    NotificationPreferenceModel,
    providers: notificationProviders,
  } = notificationEngine.init(connection, redisClient, {
    firebaseServiceAccountJson: config.FIREBASE_SERVICE_ACCOUNT_JSON,
    slackWebhookUrl: config.SLACK_WEBHOOK_URL,
    twilioAccountSid: config.TWILIO_ACCOUNT_SID,
    twilioAuthToken: config.TWILIO_AUTH_TOKEN,
    twilioPhoneNumber: config.TWILIO_PHONE_NUMBER,
    sesRegion: config.AWS_SES_REGION,
    sesAccessKeyId: config.AWS_SES_ACCESS_KEY_ID,
    sesSecretAccessKey: config.AWS_SES_SECRET_ACCESS_KEY,
    sesFromEmail: config.AWS_SES_FROM_EMAIL,
    defaultTimezone: 'Australia/Sydney',
  }, {
    UserModel: UserModel as never,
  });

  // Phase 8: Engagement Modules — Models
  const ReferralModel = createReferralModel(connection);
  const ReferralConfigModel = createReferralConfigModel(connection);
  const TaxDeadlineModel = createTaxDeadlineModel(connection);
  const DeadlineReminderModel = createDeadlineReminderModel(connection);
  const ReputationReviewModel = createReviewModel(connection);

  // Promo Code & Credit models
  const PromoCodeModel = createPromoCodeModel(connection);
  const PromoCodeUsageModel = createPromoCodeUsageModel(connection);
  const CreditTransactionModel = createCreditTransactionModel(connection);

  // Settings
  const SettingModel = createSettingModel(connection);
  await seedDefaultSettings(SettingModel);

  // Appointment Scheduling
  const AppointmentModel = createAppointmentModel(connection);
  const StaffAvailabilityModel = createStaffAvailabilityModel(connection);

  // Privacy Act 1988: Data Lifecycle (GAP-C01/C02)
  const privacyModelConfigs = new Map<string, ModelFieldConfig>([
    ['User', {
      displayName: 'User Account',
      model: UserModel as never,
      userIdField: '_id',
      piiFields: {
        firstName: '[REDACTED]',
        lastName: '[REDACTED]',
        email: 'redacted@deleted.local',
        mobile: '+61000000000',
        dateOfBirth: '',
        'address.street': '[REDACTED]',
        'address.suburb': '[REDACTED]',
        tfnEncrypted: '',
        tfnLastThree: '***',
        abnNumber: '',
      },
      exportExclude: ['tfnEncrypted', 'passwordHash', 'mfaSecret'],
    }],
    ['Lead', {
      displayName: 'Lead Records',
      model: LeadModel as never,
      userIdField: 'convertedUserId',
      piiFields: {
        firstName: '[REDACTED]',
        lastName: '[REDACTED]',
        mobile: '+61000000000',
        email: 'redacted@deleted.local',
        'address.suburb': '[REDACTED]',
      },
    }],
    ['Order', {
      displayName: 'Orders',
      model: OrderModel as never,
      userIdField: 'userId',
      piiFields: {
        'personalDetails.firstName': '[REDACTED]',
        'personalDetails.lastName': '[REDACTED]',
        'personalDetails.email': 'redacted@deleted.local',
        'personalDetails.mobile': '+61000000000',
        'personalDetails.tfnEncrypted': '',
        'personalDetails.tfnLastThree': '***',
        'personalDetails.address.street': '[REDACTED]',
        'spouse.firstName': '[REDACTED]',
        'spouse.lastName': '[REDACTED]',
        'spouse.tfnEncrypted': '',
      },
      exportExclude: ['personalDetails.tfnEncrypted', 'spouse.tfnEncrypted'],
    }],
    ['VaultDocument', {
      displayName: 'Vault Documents',
      model: VaultDocumentModel as never,
      userIdField: 'userId',
      piiFields: {},
      hardDelete: true,
    }],
    ['TaxYearSummary', {
      displayName: 'Tax Year Summaries',
      model: TaxYearSummaryModel as never,
      userIdField: 'userId',
      piiFields: {},
      hardDelete: true,
    }],
    ['ChatConversation', {
      displayName: 'Chat Conversations',
      model: ChatConversationModel as never,
      userIdField: 'userId',
      piiFields: {},
      hardDelete: true,
    }],
    ['ChatMessage', {
      displayName: 'Chat Messages',
      model: ChatMessageModel as never,
      userIdField: 'senderId',
      piiFields: { content: '[REDACTED]', contentOriginal: '' },
      exportExclude: ['contentOriginal'],
    }],
    ['SupportTicket', {
      displayName: 'Support Tickets',
      model: SupportTicketModel as never,
      userIdField: 'userId',
      piiFields: {},
    }],
    ['TaxEstimateLog', {
      displayName: 'Tax Estimate Logs',
      model: TaxEstimateLogModel as never,
      userIdField: 'userId',
      piiFields: {},
      hardDelete: true,
    }],
    ['TaxReturnResult', {
      displayName: 'Tax Return Results',
      model: TaxReturnResultModel as never,
      userIdField: 'userId',
      piiFields: {},
      hardDelete: true,
    }],
  ]);

  const {
    ErasureRequestModel,
    DataExportModel,
  } = dataLifecycle.init(connection, {
    erasureGracePeriodDays: 30,
    exportExpiryHours: 48,
    retentionPolicies: [
      {
        modelName: 'ChatMessage',
        retentionDays: 730, // 2 years
        action: 'anonymize',
        dateField: 'createdAt',
      },
    ],
  }, privacyModelConfigs);

  // 5. Seed data
  await rbac.seedRoles(RoleModel);

  // Seed tax rules (need a system user — use first super_admin or create placeholder ID)
  const systemUser = await UserModel.findOne({ userType: 0 });
  if (systemUser) {
    await seedTaxRules(TaxRuleConfigModel, systemUser._id);
    await seedTaxEngineRules(TaxRuleConfigModelV2, systemUser._id);
  }

  // Seed Sales catalogue with Australian services (Phase 3)
  await seedSalesCatalogue(SalesModel);

  // 5b. Ensure performance indexes (idempotent, non-blocking)
  if (config.NODE_ENV === 'production') {
    const indexResult = await ensurePerformanceIndexes(connection);
    if (indexResult.created.length > 0) {
      logger.info(`Created ${indexResult.created.length} performance indexes`, { indexes: indexResult.created });
    }
    if (indexResult.errors.length > 0) {
      logger.warn('Failed to create some indexes', { errors: indexResult.errors });
    }
  }

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

  // Form Mapping routes
  const formMappingRouter = createFormMappingRoutes({
    FormMappingModel,
    FormMappingVersionModel,
    SalesModel: SalesModel as never,
    connection,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
  });

  // Consent Form routes (AES-256-GCM encrypted submissions)
  const consentFormRouter = createConsentFormRoutes({
    ConsentFormModel,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
  });

  // Phase 4: Tax engine routes
  const taxEngineRouter = createTaxEngineRoutes({
    TaxRuleConfigModel: TaxRuleConfigModelV2,
    TaxEstimateLogModel,
    TaxReturnResultModel,
    CounterModel,
    connection,
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

  // Phase 5: Broadcast routes
  const broadcastRouter = broadcastEngine.createBroadcastRoutes({
    CampaignModel: BroadcastCampaignModel,
    TemplateModel: BroadcastTemplateModel,
    MessageModel: BroadcastMessageModel,
    OptOutModel: BroadcastOptOutModel,
    ConsentModel: BroadcastConsentModel,
    LeadModel: LeadModel as never,
    UserModel: UserModel as never,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
    auditLog: {
      log: auditLog.log,
      logFromRequest: auditLog.logFromRequest,
    },
    providers: broadcastProviders,
    redisClient,
    config: {
      businessName: config.BUSINESS_NAME,
      businessAbn: config.BUSINESS_ABN,
      unsubscribeBaseUrl: config.UNSUBSCRIBE_BASE_URL,
    },
  });

  // Phase 6: Client Portal routes
  const portalRouter = createPortalRoutes({
    VaultDocumentModel,
    TaxYearSummaryModel,
    UserModel: UserModel as never,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
    auditLog: {
      log: auditLog.log,
      logFromRequest: auditLog.logFromRequest,
    },
    s3Service: {
      upload: fileStorage.uploadToS3,
      delete: fileStorage.deleteFromS3,
      getPresignedUrl: fileStorage.getPresignedUrl,
    },
    virusScanService: {
      scan: fileStorage.scanBuffer,
    },
    storageQuotaService: {
      checkQuota: fileStorage.checkQuota,
      incrementUsage: fileStorage.incrementUsage,
      decrementUsage: fileStorage.decrementUsage,
      getUsage: fileStorage.getUsage,
    },
    dedupService: {
      check: fileStorage.checkDuplicate,
    },
    config: {
      s3Bucket: config.S3_BUCKET ?? 'qegos-vault-dev',
      s3QuarantineBucket: config.S3_QUARANTINE_BUCKET ?? 'qegos-quarantine-dev',
      s3Region: config.S3_REGION ?? config.AWS_SES_REGION ?? 'ap-southeast-2',
      s3AccessKeyId: config.S3_ACCESS_KEY_ID ?? '',
      s3SecretAccessKey: config.S3_SECRET_ACCESS_KEY ?? '',
    },
  });

  // Settings service for other modules to use
  const settingsService = (await import('./modules/settings/settings.service')).createSettingsService({
    SettingModel,
  });

  // Promo Code & Credit services
  const promoCodeService = createPromoCodeService({
    PromoCodeModel,
    PromoCodeUsageModel,
  });
  const creditServiceInstance = createCreditService({
    CreditTransactionModel,
  });

  // Form Draft model for save-as-you-go form filling
  const FormDraftModel = createFormDraftModel(connection);

  // Client-facing Form Fill routes (mounted under /portal)
  const formFillRouter = createFormFillRoutes({
    FormMappingModel,
    FormMappingVersionModel,
    OrderModel: OrderModel as never,
    SalesModel: SalesModel as never,
    CounterModel: CounterModel as never,
    FormDraftModel,
    authenticate: auth.authenticate,
    promoCodeService,
    creditService: creditServiceInstance,
  });
  // Mount form fill routes under the portal prefix
  portalRouter.use(formFillRouter);

  // Client-facing Pay Now routes (credits + promo + Stripe)
  const payOrderRouter = createPayOrderRoutes({
    OrderModel: OrderModel as never,
    PaymentModel,
    GatewayConfigModel,
    providers,
    authenticate: auth.authenticate,
    promoCodeService,
    creditService: creditServiceInstance,
  });
  portalRouter.use(payOrderRouter);

  // Staff-facing Collect Payment on Behalf of Client (admin/CRM)
  const collectPaymentRouter = createCollectPaymentRoutes({
    OrderModel: OrderModel as never,
    PaymentModel,
    GatewayConfigModel,
    providers,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
    promoCodeService,
    creditService: creditServiceInstance,
  });

  // Client-facing Appointment Booking routes (mounted under /portal)
  const appointmentBookingRouter = createAppointmentBookingRoutes({
    AppointmentModel,
    StaffAvailabilityModel,
    OrderModel: OrderModel as never,
    UserModel: UserModel as never,
    authenticate: auth.authenticate,
    getSetting: settingsService.getSetting,
  });
  portalRouter.use(appointmentBookingRouter);

  // Phase 7: Communication Suite routes
  const chatRouter = chatEngine.createChatRoutes({
    ConversationModel: ChatConversationModel,
    MessageModel: ChatMessageModel,
    CannedResponseModel,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
    auditLog: {
      log: auditLog.log,
      logFromRequest: auditLog.logFromRequest,
    },
    config: { encryptionKey: config.ENCRYPTION_KEY },
  });

  const ticketRouter = supportTickets.createTicketRoutes({
    TicketModel: SupportTicketModel,
    CounterModel: CounterModel as never,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
    auditLog: {
      log: auditLog.log,
      logFromRequest: auditLog.logFromRequest,
    },
  });

  const whatsappRouter = whatsappConnector.createWhatsAppRoutes({
    ConfigModel: WhatsAppConfigModel,
    MessageModel: WhatsAppMessageModel,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
    auditLog: {
      log: auditLog.log,
      logFromRequest: auditLog.logFromRequest,
    },
    config: {
      accessToken: config.WHATSAPP_API_TOKEN,
      phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
      webhookVerifyToken: config.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    },
  });

  // Privacy Act 1988 routes
  const privacyRouter = createPrivacyRoutes({
    ErasureRequestModel,
    DataExportModel,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
  });

  // Phase 2: Xero Integration routes
  const xeroRouter = xeroConnector.createXeroRoutes({
    XeroConfigModel,
    XeroSyncLogModel,
    OrderModel: OrderModel as never,
    UserModel: UserModel as never,
    PaymentModel: PaymentModel as never,
    redisClient,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
    auditLog: {
      log: auditLog.log,
      logFromRequest: auditLog.logFromRequest,
    },
    config: xeroConfig,
  });

  // Phase 8: Engagement routes
  const referralRouter = createReferralRoutes({
    ReferralModel,
    ReferralConfigModel,
    UserModel: UserModel as never,
    OrderModel: OrderModel as never,
    LeadModel: LeadModel as never,
    CounterModel: CounterModel as never,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
    creditService: creditServiceInstance,
  });

  // Promo Code routes (admin CRUD)
  const promoCodeRouter = createPromoCodeRoutes({
    PromoCodeModel,
    PromoCodeUsageModel,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
  });

  // Credit routes (client balance/transactions, admin lookup)
  const creditRouter = createCreditRoutes({
    CreditTransactionModel,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
  });

  const calendarRouter = createCalendarRoutes({
    TaxDeadlineModel,
    DeadlineReminderModel,
    OrderModel: OrderModel as never,
    UserModel: UserModel as never,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
  });

  const reputationRouter = createReputationRoutes({
    ReviewModel: ReputationReviewModel,
    OrderModel: OrderModel as never,
    UserModel: UserModel as never,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
  });

  // Notification Engine routes
  const notificationRouter = notificationEngine.createNotificationRoutes({
    NotificationModel,
    NotificationPreferenceModel,
    UserModel: UserModel as never,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
    auditLog: {
      log: auditLog.log,
      logFromRequest: auditLog.logFromRequest,
    },
    providers: notificationProviders,
    redisClient,
    config: {
      defaultTimezone: 'Australia/Sydney',
    },
  });

  // ─── Redis connection opts (shared by all BullMQ queues) ─────────────────
  const redisConnectionOpts = {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || undefined,
  };

  const defaultJobOptions = {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  };

  // Analytics Engine — stateless init + routes
  const analyticsConfig = analyticsEngine.init({
    analyticsReplicaUri: config.ANALYTICS_REPLICA_URI,
  });

  const analyticsExportQueue = new Queue('analytics-export', {
    connection: redisConnectionOpts,
    defaultJobOptions,
  });

  const analyticsRouter = analyticsEngine.createAnalyticsRoutes({
    OrderModel: OrderModel as never,
    PaymentModel: PaymentModel as never,
    LeadModel: LeadModel as never,
    LeadActivityModel: LeadActivityModel as never,
    CampaignModel: BroadcastCampaignModel as never,
    ReviewAssignmentModel: ReviewAssignmentModel as never,
    SupportTicketModel: SupportTicketModel as never,
    TaxYearSummaryModel: TaxYearSummaryModel as never,
    UserModel: UserModel as never,
    redisClient,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
    auditLog: {
      log: auditLog.log,
      logFromRequest: auditLog.logFromRequest,
    },
    config: analyticsConfig,
    exportQueue: analyticsExportQueue,
  });

  // Settings routes
  const settingsRouter = createSettingsRoutes({
    SettingModel,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
  });

  // Appointment Scheduling routes
  const { appointmentRouter, staffAvailabilityRouter } = createAppointmentRoutes({
    AppointmentModel,
    StaffAvailabilityModel,
    OrderModel: OrderModel as never,
    UserModel: UserModel as never,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
    notificationSend: notificationEngine.send as (params: Record<string, unknown>) => Promise<unknown>,
    getSetting: settingsService.getSetting,
  });

  // Staff Workload Balancing routes
  const workloadRouter = createWorkloadRoutes({
    UserModel: UserModel as never,
    LeadModel: LeadModel as never,
    OrderModel: OrderModel as never,
    ReviewAssignmentModel: ReviewAssignmentModel as never,
    SupportTicketModel: SupportTicketModel as never,
    AppointmentModel: AppointmentModel as never,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
  });

  // Document Management & Signing routes
  const zohoSignConfig = {
    clientId: config.ZOHO_SIGN_CLIENT_ID ?? '',
    clientSecret: config.ZOHO_SIGN_CLIENT_SECRET ?? '',
    refreshToken: config.ZOHO_SIGN_REFRESH_TOKEN ?? '',
    webhookSecret: config.ZOHO_SIGN_WEBHOOK_SECRET ?? '',
    baseUrl: config.ZOHO_SIGN_BASE_URL,
  };
  const documentRouter = createDocumentRoutes({
    OrderModel: OrderModel as never,
    UserModel: UserModel as never,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
    auditLog: { log: auditLog.log },
    zohoSignConfig,
  });
  const zohoWebhookRouter = createZohoWebhookRoute({
    OrderModel: OrderModel as never,
    UserModel: UserModel as never,
    authenticate: auth.authenticate,
    checkPermission: rbac.check,
    auditLog: { log: auditLog.log },
    zohoSignConfig,
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
    collectPaymentRouter,
    salesRouter,
    formMappingRouter,
    consentFormRouter,
    reviewRouter,
    taxEngineRouter,
    broadcastRouter,
    portalRouter,
    chatRouter,
    ticketRouter,
    whatsappRouter,
    privacyRouter,
    xeroRouter,
    settingsRouter,
    referralRouter,
    calendarRouter,
    reputationRouter,
    promoCodeRouter,
    creditRouter,
    notificationRouter,
    analyticsRouter,
    appointmentRouter,
    staffAvailabilityRouter,
    workloadRouter,
    documentRouter,
    zohoWebhookRouter,
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
    smartAssignBulk: getWorkloadService()?.smartAssignBulk,
  });

  // ─── BullMQ Retry Hardening ──────────────────────────────────────────────
  // redisConnectionOpts and defaultJobOptions defined above (before analytics queue)

  // BullMQ structured logger
  const jobLogger = logger.child({ module: 'bullmq' });

  // Dead-letter queue for permanently failed jobs across all queues
  const deadLetterQueue = new Queue('dead-letter', { connection: redisConnectionOpts });

  /**
   * Move a failed job to the dead-letter queue after all retries are exhausted.
   * Preserves original queue name, job name, data, and error for debugging.
   */
  async function moveToDeadLetter(
    sourceQueue: string,
    job: Job | undefined,
    err: Error,
  ): Promise<void> {
    if (!job) return;

    // Only move to DLQ if all attempts exhausted
    const maxAttempts = (job.opts?.attempts ?? defaultJobOptions.attempts);
    if (job.attemptsMade < maxAttempts) return;

    await deadLetterQueue.add('dead-letter-entry', {
      originalQueue: sourceQueue,
      originalJobName: job.name,
      originalJobData: job.data,
      failedAt: new Date().toISOString(),
      attemptsMade: job.attemptsMade,
      error: err.message,
      stackTrace: err.stack?.slice(0, 500),
    }, {
      removeOnComplete: 500,  // Keep more DLQ entries for audit
      removeOnFail: 200,
    });

    jobLogger.error(`Job moved to dead-letter queue`, {
      queue: sourceQueue,
      jobName: job.name,
      attemptsMade: job.attemptsMade,
      error: err.message,
    });
  }

  const automationQueue = new Queue('lead-automation', {
    connection: redisConnectionOpts,
    defaultJobOptions,
  });

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

  automationWorker.on('completed', (job) => {
    jobLogger.info('Job completed', { queue: 'lead-automation', jobName: job.name });
  });
  automationWorker.on('failed', (job, err) => {
    jobLogger.warn('Job failed', { queue: 'lead-automation', jobName: job?.name, attempt: job?.attemptsMade, error: err.message });
    void moveToDeadLetter('lead-automation', job, err);
  });

  // Phase 5: Broadcast queue jobs
  const broadcastQueue = new Queue('broadcast-engine', {
    connection: redisConnectionOpts,
    defaultJobOptions,
  });

  const broadcastJobs: Array<{ name: string; pattern: string }> = [
    { name: 'triggerScheduled', pattern: '*/1 * * * *' },      // every 1 minute
    { name: 'processSmsQueue', pattern: '*/5 * * * *' },       // every 5 minutes
    { name: 'processEmailQueue', pattern: '*/5 * * * *' },     // every 5 minutes
    { name: 'processWhatsappQueue', pattern: '*/5 * * * *' },  // every 5 minutes
    { name: 'checkCompletion', pattern: '*/10 * * * *' },      // every 10 minutes
  ];

  for (const job of broadcastJobs) {
    await broadcastQueue.add(job.name, {}, {
      repeat: { pattern: job.pattern },
    });
  }

  const broadcastWorker = new Worker(
    'broadcast-engine',
    async (job: Job): Promise<void> => {
      switch (job.name) {
        case 'triggerScheduled':
          await broadcastEngine.triggerScheduledCampaigns();
          break;
        case 'processSmsQueue': {
          const sending = await BroadcastCampaignModel.find({ status: 'sending' });
          for (const c of sending) {
            await broadcastEngine.processChannelQueue(c._id, 'sms');
          }
          break;
        }
        case 'processEmailQueue': {
          const sending = await BroadcastCampaignModel.find({ status: 'sending' });
          for (const c of sending) {
            await broadcastEngine.processChannelQueue(c._id, 'email');
          }
          break;
        }
        case 'processWhatsappQueue': {
          const sending = await BroadcastCampaignModel.find({ status: 'sending' });
          for (const c of sending) {
            await broadcastEngine.processChannelQueue(c._id, 'whatsapp');
          }
          break;
        }
        case 'checkCompletion':
          await broadcastEngine.checkCampaignCompletion();
          break;
      }
    },
    { connection: redisConnectionOpts },
  );

  broadcastWorker.on('completed', (job) => {
    jobLogger.info('Job completed', { queue: 'broadcast-engine', jobName: job.name });
  });
  broadcastWorker.on('failed', (job, err) => {
    jobLogger.warn('Job failed', { queue: 'broadcast-engine', jobName: job?.name, attempt: job?.attemptsMade, error: err.message });
    void moveToDeadLetter('broadcast-engine', job, err);
  });

  // Phase 6: Vault maintenance cron jobs
  const vaultQueue = new Queue('vault-maintenance', {
    connection: redisConnectionOpts,
    defaultJobOptions,
  });

  const vaultJobs: Array<{ name: string; pattern: string }> = [
    { name: 'hardDeleteExpired', pattern: '0 4 * * *' },       // daily at 4am
    { name: 'reconcileStorage', pattern: '0 5 1 * *' },        // 1st of month at 5am
  ];

  for (const job of vaultJobs) {
    await vaultQueue.add(job.name, {}, {
      repeat: { pattern: job.pattern },
    });
  }

  const vaultWorker = new Worker(
    'vault-maintenance',
    async (job: Job): Promise<void> => {
      switch (job.name) {
        case 'hardDeleteExpired':
          await hardDeleteExpiredDocuments();
          break;
        case 'reconcileStorage':
          await reconcileStorageUsage();
          break;
      }
    },
    { connection: redisConnectionOpts },
  );

  vaultWorker.on('completed', (job) => {
    jobLogger.info('Job completed', { queue: 'vault-maintenance', jobName: job.name });
  });
  vaultWorker.on('failed', (job, err) => {
    jobLogger.warn('Job failed', { queue: 'vault-maintenance', jobName: job?.name, attempt: job?.attemptsMade, error: err.message });
    void moveToDeadLetter('vault-maintenance', job, err);
  });

  // Phase 7: Support ticket SLA cron jobs (TKT-INV-04: every 5 min)
  const ticketQueue = new Queue('support-tickets', {
    connection: redisConnectionOpts,
    defaultJobOptions,
  });

  const ticketJobs: Array<{ name: string; pattern: string }> = [
    { name: 'checkSlaBreaches', pattern: '*/5 * * * *' },      // every 5 minutes
    { name: 'autoCloseStale', pattern: '0 */6 * * *' },        // every 6 hours
    { name: 'autoCloseResolved', pattern: '0 6 * * *' },       // daily at 6am
    { name: 'archiveOldChats', pattern: '0 3 1 * *' },         // 1st of month at 3am
  ];

  for (const job of ticketJobs) {
    await ticketQueue.add(job.name, {}, {
      repeat: { pattern: job.pattern },
    });
  }

  const ticketWorker = new Worker(
    'support-tickets',
    async (job: Job): Promise<void> => {
      switch (job.name) {
        case 'checkSlaBreaches':
          await supportTickets.checkSlaBreaches();
          break;
        case 'autoCloseStale':
          await supportTickets.autoCloseStaleTickets();
          break;
        case 'autoCloseResolved':
          await supportTickets.autoCloseResolvedTickets();
          break;
        case 'archiveOldChats':
          await chatEngine.archiveOldConversations();
          break;
      }
    },
    { connection: redisConnectionOpts },
  );

  ticketWorker.on('completed', (job) => {
    jobLogger.info('Job completed', { queue: 'support-tickets', jobName: job.name });
  });
  ticketWorker.on('failed', (job, err) => {
    jobLogger.warn('Job failed', { queue: 'support-tickets', jobName: job?.name, attempt: job?.attemptsMade, error: err.message });
    void moveToDeadLetter('support-tickets', job, err);
  });

  // Privacy Act: Data lifecycle cron jobs
  const privacyQueue = new Queue('data-lifecycle', {
    connection: redisConnectionOpts,
    defaultJobOptions,
  });

  const privacyJobs: Array<{ name: string; pattern: string }> = [
    { name: 'enforceRetention', pattern: '0 2 * * 0' },          // weekly Sunday 2am
    { name: 'cleanupExpiredExports', pattern: '0 3 * * *' },     // daily at 3am
  ];

  for (const job of privacyJobs) {
    await privacyQueue.add(job.name, {}, {
      repeat: { pattern: job.pattern },
    });
  }

  const privacyWorker = new Worker(
    'data-lifecycle',
    async (job: Job): Promise<void> => {
      switch (job.name) {
        case 'enforceRetention':
          await enforceRetentionPolicies();
          break;
        case 'cleanupExpiredExports':
          await cleanupExpiredExports();
          break;
      }
    },
    { connection: redisConnectionOpts },
  );

  privacyWorker.on('completed', (job) => {
    jobLogger.info('Job completed', { queue: 'data-lifecycle', jobName: job.name });
  });
  privacyWorker.on('failed', (job, err) => {
    jobLogger.warn('Job failed', { queue: 'data-lifecycle', jobName: job?.name, attempt: job?.attemptsMade, error: err.message });
    void moveToDeadLetter('data-lifecycle', job, err);
  });

  // Phase 2: Xero sync cron jobs
  const xeroQueue = new Queue('xero-sync', {
    connection: redisConnectionOpts,
    defaultJobOptions,
  });

  const xeroJobs: Array<{ name: string; pattern: string }> = [
    { name: 'retryFailedSyncs', pattern: '*/5 * * * *' },       // every 5 minutes
    { name: 'flushOfflineQueue', pattern: '*/10 * * * *' },      // every 10 minutes
  ];

  for (const job of xeroJobs) {
    await xeroQueue.add(job.name, {}, {
      repeat: { pattern: job.pattern },
    });
  }

  const xeroWorker = new Worker(
    'xero-sync',
    async (job: Job): Promise<void> => {
      switch (job.name) {
        case 'retryFailedSyncs':
          await xeroConnector.retryFailedSyncs();
          break;
        case 'flushOfflineQueue':
          await xeroConnector.flushOfflineQueue();
          break;
      }
    },
    { connection: redisConnectionOpts },
  );

  xeroWorker.on('completed', (job) => {
    jobLogger.info('Job completed', { queue: 'xero-sync', jobName: job.name });
  });
  xeroWorker.on('failed', (job, err) => {
    jobLogger.warn('Job failed', { queue: 'xero-sync', jobName: job?.name, attempt: job?.attemptsMade, error: err.message });
    void moveToDeadLetter('xero-sync', job, err);
  });

  // Phase 8: Engagement engine cron jobs
  const engagementQueue = new Queue('engagement-engine', {
    connection: redisConnectionOpts,
    defaultJobOptions,
  });

  const engagementJobs: Array<{ name: string; pattern: string }> = [
    { name: 'expireReferrals', pattern: '0 2 * * *' },            // daily at 2am
    { name: 'expireCreditRewards', pattern: '0 2 * * *' },        // daily at 2am
    { name: 'processDeadlineReminders', pattern: '0 8 * * *' },   // daily at 8am (AEST)
    { name: 'sendReviewReminders', pattern: '0 10 * * *' },       // daily at 10am
  ];

  for (const job of engagementJobs) {
    await engagementQueue.add(job.name, {}, {
      repeat: { pattern: job.pattern },
    });
  }

  const engagementWorker = new Worker(
    'engagement-engine',
    async (job: Job): Promise<void> => {
      switch (job.name) {
        case 'expireReferrals':
          await expireStaleReferrals();
          break;
        case 'expireCreditRewards':
          await expireCreditRewards();
          break;
        case 'processDeadlineReminders':
          await processDeadlineReminders();
          break;
        case 'sendReviewReminders':
          await sendReviewReminders();
          break;
      }
    },
    { connection: redisConnectionOpts },
  );

  engagementWorker.on('completed', (job) => {
    jobLogger.info('Job completed', { queue: 'engagement-engine', jobName: job.name });
  });
  engagementWorker.on('failed', (job, err) => {
    jobLogger.warn('Job failed', { queue: 'engagement-engine', jobName: job?.name, attempt: job?.attemptsMade, error: err.message });
    void moveToDeadLetter('engagement-engine', job, err);
  });

  // Notification Engine: FCM token cleanup cron
  const notificationQueue = new Queue('notification-engine', {
    connection: redisConnectionOpts,
    defaultJobOptions,
  });

  const notificationJobs: Array<{ name: string; pattern: string }> = [
    { name: 'fcmTokenCleanup', pattern: '0 3 * * *' },         // daily at 3am — remove tokens not used in 30+ days
  ];

  for (const job of notificationJobs) {
    await notificationQueue.add(job.name, {}, {
      repeat: { pattern: job.pattern },
    });
  }

  const notificationWorker = new Worker(
    'notification-engine',
    async (job: Job): Promise<void> => {
      switch (job.name) {
        case 'fcmTokenCleanup': {
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          await UserModel.updateMany(
            {},
            { $pull: { fcmTokens: { lastUsed: { $lt: thirtyDaysAgo } } } } as never,
          );
          break;
        }
      }
    },
    { connection: redisConnectionOpts },
  );

  notificationWorker.on('completed', (job) => {
    jobLogger.info('Job completed', { queue: 'notification-engine', jobName: job.name });
  });
  notificationWorker.on('failed', (job, err) => {
    jobLogger.warn('Job failed', { queue: 'notification-engine', jobName: job?.name, attempt: job?.attemptsMade, error: err.message });
    void moveToDeadLetter('notification-engine', job, err);
  });

  // Analytics Engine: executive summary pre-computation (ANA-INV-07) + export queue
  const analyticsQueue = new Queue('analytics-engine', {
    connection: redisConnectionOpts,
    defaultJobOptions,
  });

  const analyticsJobs: Array<{ name: string; pattern: string }> = [
    { name: 'computeExecutiveSummary', pattern: '*/5 * * * *' },  // every 5 minutes
  ];

  for (const job of analyticsJobs) {
    await analyticsQueue.add(job.name, {}, {
      repeat: { pattern: job.pattern },
    });
  }

  const analyticsWorker = new Worker(
    'analytics-engine',
    async (job: Job): Promise<void> => {
      switch (job.name) {
        case 'computeExecutiveSummary':
          await analyticsEngine.computeExecutiveSummary({
            OrderModel: OrderModel as never,
            PaymentModel: PaymentModel as never,
            LeadModel: LeadModel as never,
            LeadActivityModel: LeadActivityModel as never,
            CampaignModel: BroadcastCampaignModel as never,
            ReviewAssignmentModel: ReviewAssignmentModel as never,
            SupportTicketModel: SupportTicketModel as never,
            TaxYearSummaryModel: TaxYearSummaryModel as never,
            UserModel: UserModel as never,
            redisClient,
            authenticate: auth.authenticate,
            checkPermission: rbac.check,
            config: analyticsConfig,
          });
          break;
      }
    },
    { connection: redisConnectionOpts },
  );

  analyticsWorker.on('completed', (job) => {
    jobLogger.info('Job completed', { queue: 'analytics-engine', jobName: job.name });
  });
  analyticsWorker.on('failed', (job, err) => {
    jobLogger.warn('Job failed', { queue: 'analytics-engine', jobName: job?.name, attempt: job?.attemptsMade, error: err.message });
    void moveToDeadLetter('analytics-engine', job, err);
  });

  // Appointment Scheduling: reminders (APT-INV-02) + no-show marking (APT-INV-03)
  const appointmentQueue = new Queue('appointment-scheduling', {
    connection: redisConnectionOpts,
    defaultJobOptions,
  });

  const appointmentJobs: Array<{ name: string; pattern: string }> = [
    { name: 'processAppointmentReminders', pattern: '*/5 * * * *' },  // every 5 minutes
    { name: 'markNoShows', pattern: '*/10 * * * *' },                 // every 10 minutes
  ];

  for (const job of appointmentJobs) {
    await appointmentQueue.add(job.name, {}, {
      repeat: { pattern: job.pattern },
    });
  }

  const appointmentWorker = new Worker(
    'appointment-scheduling',
    async (job: Job): Promise<void> => {
      switch (job.name) {
        case 'processAppointmentReminders':
          await processAppointmentReminders();
          break;
        case 'markNoShows':
          await markNoShows();
          break;
      }
    },
    { connection: redisConnectionOpts },
  );

  appointmentWorker.on('completed', (job) => {
    jobLogger.info('Job completed', { queue: 'appointment-scheduling', jobName: job.name });
  });
  appointmentWorker.on('failed', (job, err) => {
    jobLogger.warn('Job failed', { queue: 'appointment-scheduling', jobName: job?.name, attempt: job?.attemptsMade, error: err.message });
    void moveToDeadLetter('appointment-scheduling', job, err);
  });

  // 8. Create HTTP server + Socket.io for real-time chat
  const port = config.PORT;
  const httpServer = createHttpServer(app);

  // Attach Socket.io to the HTTP server
  const chatSocketServer = chatEngine.initChatSocket(httpServer, {
    corsOrigins: config.CORS_ORIGINS ? config.CORS_ORIGINS.split(',') : '*',
    verifyToken: async (token: string) => {
      const payload = auth.jwtService.verifyAccessToken(token);
      return { userId: payload.userId, userType: String(payload.userType) };
    },
  });

  const server = httpServer.listen(port, () => {
    logger.info(`QEGOS API running on port ${port}`, { env: config.NODE_ENV, socketIo: true });
  });

  // 9. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info('Graceful shutdown initiated', { signal });
    chatSocketServer.close();
    server.close(async () => {
      await automationWorker.close();
      await automationQueue.close();
      await broadcastWorker.close();
      await broadcastQueue.close();
      await vaultWorker.close();
      await vaultQueue.close();
      await ticketWorker.close();
      await ticketQueue.close();
      await privacyWorker.close();
      await privacyQueue.close();
      await engagementWorker.close();
      await engagementQueue.close();
      await xeroWorker.close();
      await xeroQueue.close();
      await notificationWorker.close();
      await notificationQueue.close();
      await analyticsWorker.close();
      await analyticsQueue.close();
      await analyticsExportQueue.close();
      await appointmentWorker.close();
      await appointmentQueue.close();
      await deadLetterQueue.close();
      await disconnectDatabase();
      await disconnectRedis();
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', { error: (err as Error).message, stack: (err as Error).stack });
  process.exit(1);
});
