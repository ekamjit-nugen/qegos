import { routePayment, isRetryable, resetRoundRobinIndex } from '../src/services/paymentRouter';
import type {
  IPaymentProvider,
  IGatewayConfig,
  PaymentGateway,
  CreateIntentParams,
  PaymentIntentResult,
  GatewayError,
} from '../src/types';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createMockProvider(
  name: PaymentGateway,
  result?: Partial<PaymentIntentResult>,
  error?: GatewayError,
): IPaymentProvider {
  return {
    name,
    createPaymentIntent: error
      ? jest.fn().mockRejectedValue(error)
      : jest.fn().mockResolvedValue({
          gatewayTxnId: `${name}_txn_123`,
          clientSecret: `${name}_secret`,
          gateway: name,
          publishableKey: `${name}_pk`,
          status: 'requires_payment_method',
          ...result,
        }),
    capturePayment: jest.fn(),
    refundPayment: jest.fn(),
    getPaymentStatus: jest.fn(),
    testConnection: jest.fn().mockResolvedValue(true),
  };
}

function createBaseParams(): CreateIntentParams {
  return {
    amount: 16500,
    currency: 'AUD',
    orderId: '507f1f77bcf86cd799439011',
    userId: '507f1f77bcf86cd799439012',
    idempotencyKey: 'test-key-123',
  };
}

function createBaseConfig(overrides?: Partial<IGatewayConfig>): IGatewayConfig {
  return {
    primaryGateway: 'stripe',
    routingRule: 'primary_only',
    amountThreshold: 100000,
    stripeEnabled: true,
    stripePublishableKey: 'pk_test_xxx',
    payrooEnabled: true,
    payrooPublicKey: 'pz_pk_xxx',
    fallbackTimeoutMs: 10000,
    maintenanceMode: false,
    maintenanceMessage: '',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PaymentRouter', () => {
  beforeEach(() => {
    resetRoundRobinIndex();
  });

  describe('isRetryable', () => {
    it('should return true for ETIMEDOUT network error', () => {
      const err: GatewayError = new Error('timeout') as GatewayError;
      err.code = 'ETIMEDOUT';
      expect(isRetryable(err)).toBe(true);
    });

    it('should return true for ECONNREFUSED network error', () => {
      const err: GatewayError = new Error('refused') as GatewayError;
      err.code = 'ECONNREFUSED';
      expect(isRetryable(err)).toBe(true);
    });

    it('should return true for 5xx status codes', () => {
      const err: GatewayError = new Error('server error') as GatewayError;
      err.statusCode = 502;
      expect(isRetryable(err)).toBe(true);
    });

    it('should return false for card_declined (PAY-INV-08)', () => {
      const err: GatewayError = new Error('declined') as GatewayError;
      err.type = 'card_declined';
      expect(isRetryable(err)).toBe(false);
    });

    it('should return false for insufficient_funds (PAY-INV-08)', () => {
      const err: GatewayError = new Error('no funds') as GatewayError;
      err.type = 'insufficient_funds';
      expect(isRetryable(err)).toBe(false);
    });

    it('should return false for expired_card (PAY-INV-08)', () => {
      const err: GatewayError = new Error('expired') as GatewayError;
      err.code = 'expired_card';
      expect(isRetryable(err)).toBe(false);
    });

    it('should return false for unknown errors (safe default)', () => {
      const err: GatewayError = new Error('unknown') as GatewayError;
      expect(isRetryable(err)).toBe(false);
    });
  });

  describe('routePayment — primary_only', () => {
    it('should use the primary gateway', async () => {
      const stripeProvider = createMockProvider('stripe');
      const providers = new Map<PaymentGateway, IPaymentProvider>();
      providers.set('stripe', stripeProvider);

      const config = createBaseConfig({ routingRule: 'primary_only' });
      const result = await routePayment(createBaseParams(), config, providers);

      expect(result.gateway).toBe('stripe');
      expect(stripeProvider.createPaymentIntent).toHaveBeenCalledTimes(1);
    });

    it('should throw if primary gateway is unavailable', async () => {
      const providers = new Map<PaymentGateway, IPaymentProvider>();

      const config = createBaseConfig({ routingRule: 'primary_only' });
      await expect(routePayment(createBaseParams(), config, providers)).rejects.toThrow(
        'not available',
      );
    });
  });

  describe('routePayment — fallback', () => {
    it('should fall back to secondary on ETIMEDOUT (PAY-INV-08)', async () => {
      const timeoutError: GatewayError = new Error('timeout') as GatewayError;
      timeoutError.code = 'ETIMEDOUT';
      timeoutError.isRetryable = true;

      const stripeProvider = createMockProvider('stripe', undefined, timeoutError);
      const payrooProvider = createMockProvider('payroo');
      const providers = new Map<PaymentGateway, IPaymentProvider>();
      providers.set('stripe', stripeProvider);
      providers.set('payroo', payrooProvider);

      const config = createBaseConfig({ routingRule: 'fallback' });
      const result = await routePayment(createBaseParams(), config, providers);

      expect(result.gateway).toBe('payroo');
      expect(stripeProvider.createPaymentIntent).toHaveBeenCalledTimes(1);
      expect(payrooProvider.createPaymentIntent).toHaveBeenCalledTimes(1);
    });

    it('should NOT fall back on card_declined (PAY-INV-08)', async () => {
      const businessError: GatewayError = new Error('declined') as GatewayError;
      businessError.type = 'card_declined';
      businessError.isRetryable = false;

      const stripeProvider = createMockProvider('stripe', undefined, businessError);
      const payrooProvider = createMockProvider('payroo');
      const providers = new Map<PaymentGateway, IPaymentProvider>();
      providers.set('stripe', stripeProvider);
      providers.set('payroo', payrooProvider);

      const config = createBaseConfig({ routingRule: 'fallback' });
      await expect(routePayment(createBaseParams(), config, providers)).rejects.toThrow('declined');

      expect(payrooProvider.createPaymentIntent).not.toHaveBeenCalled();
    });

    it('should use primary when primary succeeds', async () => {
      const stripeProvider = createMockProvider('stripe');
      const payrooProvider = createMockProvider('payroo');
      const providers = new Map<PaymentGateway, IPaymentProvider>();
      providers.set('stripe', stripeProvider);
      providers.set('payroo', payrooProvider);

      const config = createBaseConfig({ routingRule: 'fallback' });
      const result = await routePayment(createBaseParams(), config, providers);

      expect(result.gateway).toBe('stripe');
      expect(payrooProvider.createPaymentIntent).not.toHaveBeenCalled();
    });
  });

  describe('routePayment — round_robin', () => {
    it('should alternate between gateways', async () => {
      const stripeProvider = createMockProvider('stripe');
      const payrooProvider = createMockProvider('payroo');
      const providers = new Map<PaymentGateway, IPaymentProvider>();
      providers.set('stripe', stripeProvider);
      providers.set('payroo', payrooProvider);

      const config = createBaseConfig({ routingRule: 'round_robin' });

      const result1 = await routePayment(createBaseParams(), config, providers);
      const result2 = await routePayment(createBaseParams(), config, providers);

      expect(result1.gateway).not.toBe(result2.gateway);
    });
  });

  describe('routePayment — amount_based', () => {
    it('should use primary below threshold', async () => {
      const stripeProvider = createMockProvider('stripe');
      const payrooProvider = createMockProvider('payroo');
      const providers = new Map<PaymentGateway, IPaymentProvider>();
      providers.set('stripe', stripeProvider);
      providers.set('payroo', payrooProvider);

      const config = createBaseConfig({
        routingRule: 'amount_based',
        amountThreshold: 100000, // $1000
      });

      // Below threshold — should use primary (stripe)
      const params = createBaseParams();
      params.amount = 50000; // $500
      const result = await routePayment(params, config, providers);

      expect(result.gateway).toBe('stripe');
    });

    it('should use secondary above threshold', async () => {
      const stripeProvider = createMockProvider('stripe');
      const payrooProvider = createMockProvider('payroo');
      const providers = new Map<PaymentGateway, IPaymentProvider>();
      providers.set('stripe', stripeProvider);
      providers.set('payroo', payrooProvider);

      const config = createBaseConfig({
        routingRule: 'amount_based',
        amountThreshold: 100000, // $1000
      });

      // Above threshold — should use secondary (payroo)
      const params = createBaseParams();
      params.amount = 200000; // $2000
      const result = await routePayment(params, config, providers);

      expect(result.gateway).toBe('payroo');
    });
  });
});
