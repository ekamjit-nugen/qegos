import type { Connection, Model } from 'mongoose';
import type Redis from 'ioredis';
import { createPaymentModel } from './models/paymentModel';
import { createWebhookEventModel } from './models/webhookEventModel';
import { createGatewayConfigModel } from './models/gatewayConfigModel';
import { initStripeProvider, stripeProvider } from './services/stripeProvider';
import { initPayzooProvider, payzooProvider } from './services/payzooProvider';
import { initWebhookProcessor } from './services/webhookProcessor';
import { initRefundService } from './services/refundService';
import { initIdempotencyService } from './services/idempotencyService';
import { initStripeWebhookVerify } from './middleware/stripeWebhookVerify';
import { initPayzooWebhookVerify } from './middleware/payzooWebhookVerify';
import { initMaintenanceMode } from './middleware/maintenanceMode';
import type {
  IPaymentDocument,
  IWebhookEventDocument,
  IGatewayConfigDocument,
  PaymentGatewayConfig,
  PaymentGateway,
  IPaymentProvider,
} from './types';

export interface PaymentGatewayInitResult {
  PaymentModel: Model<IPaymentDocument>;
  WebhookEventModel: Model<IWebhookEventDocument>;
  GatewayConfigModel: Model<IGatewayConfigDocument>;
  providers: Map<PaymentGateway, IPaymentProvider>;
}

/**
 * Initialize the payment gateway package with configuration and database connection.
 * Must be called before using any payment services, middleware, or routes.
 *
 * The consuming app provides:
 * - Mongoose connection (Database Isolation rule)
 * - Redis client for idempotency caching
 * - Gateway-specific API keys/secrets
 */
export function init(
  connection: Connection,
  redisClient: Redis,
  config: PaymentGatewayConfig,
): PaymentGatewayInitResult {
  // Create models
  const PaymentModel = createPaymentModel(connection);
  const WebhookEventModel = createWebhookEventModel(connection);
  const GatewayConfigModel = createGatewayConfigModel(connection);

  // Initialize providers
  const providers = new Map<PaymentGateway, IPaymentProvider>();

  if (config.stripeSecretKey) {
    initStripeProvider({
      secretKey: config.stripeSecretKey,
      publishableKey: '', // Set via gateway config in DB
      apiVersion: '2024-04-10',
    });
    providers.set('stripe', stripeProvider);
  }

  if (config.payzooApiKey && config.payzooApiSecret && config.payzooBaseUrl) {
    initPayzooProvider({
      apiKey: config.payzooApiKey,
      apiSecret: config.payzooApiSecret,
      baseUrl: config.payzooBaseUrl,
      publicKey: '', // Set via gateway config in DB
    });
    providers.set('payzoo', payzooProvider);
  }

  // Initialize services
  initWebhookProcessor(WebhookEventModel, PaymentModel);
  initRefundService(PaymentModel, providers);
  initIdempotencyService(redisClient);

  // Initialize middleware
  if (config.stripeWebhookSecret) {
    initStripeWebhookVerify(config.stripeWebhookSecret);
  }
  if (config.payzooWebhookSecret) {
    initPayzooWebhookVerify(config.payzooWebhookSecret);
  }
  initMaintenanceMode(GatewayConfigModel);

  return {
    PaymentModel,
    WebhookEventModel,
    GatewayConfigModel,
    providers,
  };
}

// Re-export everything
export * from './types';
export {
  createPaymentModel,
  generatePaymentNumber,
  isValidTransition,
} from './models/paymentModel';
export { createWebhookEventModel } from './models/webhookEventModel';
export { createGatewayConfigModel } from './models/gatewayConfigModel';
export { routePayment, isRetryable, resetRoundRobinIndex } from './services/paymentRouter';
export { stripeProvider, initStripeProvider } from './services/stripeProvider';
export { payzooProvider, initPayzooProvider } from './services/payzooProvider';
export {
  processStripeWebhook,
  processPayzooWebhook,
  paymentEvents,
  initWebhookProcessor,
} from './services/webhookProcessor';
export {
  processRefund,
  getRequiredApprovalLevel,
  hasApprovalAuthority,
  initRefundService,
} from './services/refundService';
export {
  checkIdempotencyKey,
  storeIdempotencyResponse,
  removeIdempotencyKey,
  initIdempotencyService,
} from './services/idempotencyService';
export { stripeWebhookVerify, initStripeWebhookVerify } from './middleware/stripeWebhookVerify';
export { payzooWebhookVerify, initPayzooWebhookVerify } from './middleware/payzooWebhookVerify';
export { maintenanceMode, initMaintenanceMode } from './middleware/maintenanceMode';
export { calculateLineItemGST, calculateOrderGST } from './utils/gstCalculator';
export { createPaymentRoutes, type PaymentRouteDeps } from './routes/paymentRoutes';
export {
  createIntentValidation,
  capturePaymentValidation,
  refundPaymentValidation,
  getPaymentValidation,
  getOrderPaymentsValidation,
  updateConfigValidation,
  getPaymentLogsValidation,
  writeOffValidation,
  adjustInvoiceValidation,
} from './validators/paymentValidators';
