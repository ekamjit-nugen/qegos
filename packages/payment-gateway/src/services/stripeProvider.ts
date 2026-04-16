import Stripe from 'stripe';
import type {
  IPaymentProvider,
  CreateIntentParams,
  PaymentIntentResult,
  CaptureParams,
  CaptureResult,
  CancelParams,
  CancelResult,
  RefundParams,
  RefundResult,
  PaymentStatusResult,
  GatewayError,
} from '../types';

interface StripeProviderConfig {
  secretKey: string;
  publishableKey: string;
  apiVersion?: string;
}

let _stripe: Stripe | null = null;
let _publishableKey = '';

/**
 * Initialize the Stripe provider with configuration.
 * Must be called before using the provider.
 */
export function initStripeProvider(config: StripeProviderConfig): void {
  _stripe = new Stripe(config.secretKey, {
    apiVersion: '2024-04-10' as Stripe.LatestApiVersion,
    timeout: 30000, // 30s timeout
    maxNetworkRetries: 0, // We handle retries ourselves via PaymentRouter
  });
  _publishableKey = config.publishableKey;
}

function getStripe(): Stripe {
  if (!_stripe) {
    throw new Error('Stripe provider not initialized. Call initStripeProvider first.');
  }
  return _stripe;
}

/**
 * Map Stripe errors to our GatewayError type for consistent error classification.
 */
function mapStripeError(err: Stripe.errors.StripeError): GatewayError {
  const gatewayErr: GatewayError = new Error(err.message) as GatewayError;
  gatewayErr.code = err.code ?? undefined;
  gatewayErr.type = err.type;
  gatewayErr.statusCode = err.statusCode ?? undefined;

  // Classify: network errors are retryable, business errors are not
  if (
    err.type === 'StripeConnectionError' ||
    err.type === 'StripeAPIError' ||
    err.type === 'StripeRateLimitError'
  ) {
    gatewayErr.isRetryable = true;
  } else {
    gatewayErr.isRetryable = false;
  }

  return gatewayErr;
}

/**
 * Stripe implementation of IPaymentProvider.
 * PAY-INV-09: Never exposes raw Stripe objects to client responses.
 */
export const stripeProvider: IPaymentProvider = {
  name: 'stripe',

  async createPaymentIntent(params: CreateIntentParams): Promise<PaymentIntentResult> {
    const stripe = getStripe();
    try {
      const intent = await stripe.paymentIntents.create(
        {
          amount: params.amount,
          currency: params.currency.toLowerCase(),
          metadata: {
            orderId: params.orderId,
            userId: params.userId,
            ...params.metadata,
          },
          capture_method: 'manual', // Two-step: authorize then capture
        },
        {
          idempotencyKey: params.idempotencyKey,
        },
      );

      return {
        gatewayTxnId: intent.id,
        clientSecret: intent.client_secret ?? '',
        gateway: 'stripe',
        publishableKey: _publishableKey,
        status: intent.status,
      };
    } catch (err) {
      throw mapStripeError(err as Stripe.errors.StripeError);
    }
  },

  async capturePayment(params: CaptureParams): Promise<CaptureResult> {
    const stripe = getStripe();
    try {
      const captured = await stripe.paymentIntents.capture(params.gatewayTxnId, {
        amount_to_capture: params.amount,
      });

      return {
        gatewayTxnId: captured.id,
        capturedAmount: captured.amount_received,
        status: captured.status,
      };
    } catch (err) {
      throw mapStripeError(err as Stripe.errors.StripeError);
    }
  },

  async cancelPayment(params: CancelParams): Promise<CancelResult> {
    const stripe = getStripe();
    // Stripe's cancellation_reason enum is restricted; map free-form
    // reason → known enum, default to 'abandoned' which best matches
    // the saga-compensation case (intent created but downstream work
    // failed before the customer ever confirmed).
    const allowed: Stripe.PaymentIntentCancelParams.CancellationReason[] = [
      'duplicate',
      'fraudulent',
      'requested_by_customer',
      'abandoned',
    ];
    const cancellation_reason = (
      allowed.includes(params.reason as Stripe.PaymentIntentCancelParams.CancellationReason)
        ? params.reason
        : 'abandoned'
    ) as Stripe.PaymentIntentCancelParams.CancellationReason;

    try {
      const cancelled = await stripe.paymentIntents.cancel(params.gatewayTxnId, {
        cancellation_reason,
      });
      return {
        gatewayTxnId: cancelled.id,
        status: cancelled.status,
      };
    } catch (err) {
      // Make this idempotent for callers: if Stripe says the intent is
      // already in a terminal state (cancelled / succeeded), treat as
      // a success — cancellation has effectively already happened (or
      // is impossible because the charge settled). Other errors bubble.
      const stripeErr = err as Stripe.errors.StripeError;
      if (
        stripeErr.code === 'payment_intent_unexpected_state' ||
        stripeErr.code === 'resource_missing'
      ) {
        return {
          gatewayTxnId: params.gatewayTxnId,
          status: 'cancelled',
        };
      }
      throw mapStripeError(stripeErr);
    }
  },

  async refundPayment(params: RefundParams): Promise<RefundResult> {
    const stripe = getStripe();
    try {
      const refund = await stripe.refunds.create(
        {
          payment_intent: params.gatewayTxnId,
          amount: params.amount,
          reason: 'requested_by_customer',
          metadata: {
            reason: params.reason ?? '',
          },
        },
        {
          idempotencyKey: params.idempotencyKey,
        },
      );

      return {
        gatewayRefundId: refund.id,
        amount: refund.amount,
        status: refund.status ?? 'pending',
      };
    } catch (err) {
      throw mapStripeError(err as Stripe.errors.StripeError);
    }
  },

  async getPaymentStatus(gatewayTxnId: string): Promise<PaymentStatusResult> {
    const stripe = getStripe();
    try {
      const intent = await stripe.paymentIntents.retrieve(gatewayTxnId);

      return {
        gatewayTxnId: intent.id,
        status: intent.status,
        amount: intent.amount,
        capturedAmount: intent.amount_received,
        refundedAmount: 0, // Stripe tracks refunds separately
      };
    } catch (err) {
      throw mapStripeError(err as Stripe.errors.StripeError);
    }
  },

  /**
   * Test connectivity by creating a $0 auth and immediately voiding it.
   */
  async testConnection(): Promise<boolean> {
    const stripe = getStripe();
    try {
      // Create a minimal payment intent to verify API connectivity
      const intent = await stripe.paymentIntents.create({
        amount: 100, // Smallest valid amount (1 AUD)
        currency: 'aud',
        capture_method: 'manual',
        confirm: false,
        metadata: { test: 'connectivity_check' },
      });

      // Cancel immediately
      await stripe.paymentIntents.cancel(intent.id);
      return true;
    } catch {
      return false;
    }
  },
};
