import type {
  IPaymentProvider,
  PaymentGateway,
  IGatewayConfig,
  CreateIntentParams,
  PaymentIntentResult,
  GatewayError,
} from '../types';

/**
 * Network/infrastructure error codes that justify fallback to another gateway.
 * PAY-INV-08: NEVER retry on business errors (card_declined, insufficient_funds, etc.)
 */
const RETRYABLE_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EPIPE',
  'EAI_AGAIN',
  'ESOCKETTIMEDOUT',
]);

const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504]);

/**
 * Business error codes from gateways — these must NEVER trigger fallback.
 */
const NON_RETRYABLE_ERROR_TYPES = new Set([
  'card_declined',
  'insufficient_funds',
  'expired_card',
  'invalid_card',
  'processing_error',
  'incorrect_cvc',
  'incorrect_zip',
  'card_not_supported',
  'currency_not_supported',
  'duplicate_transaction',
  'fraudulent',
  'lost_card',
  'stolen_card',
]);

let _roundRobinIndex = 0;

/**
 * PAY-INV-08: Classify whether a gateway error justifies retrying with a different provider.
 * ONLY network errors (ETIMEDOUT, ECONNREFUSED, 5xx) are retryable.
 * Business errors (card_declined, insufficient_funds) are NEVER retryable.
 */
export function isRetryable(error: GatewayError): boolean {
  // Explicit business errors — never retry
  if (error.type && NON_RETRYABLE_ERROR_TYPES.has(error.type)) {
    return false;
  }
  if (error.code && NON_RETRYABLE_ERROR_TYPES.has(error.code)) {
    return false;
  }

  // Network errors — retryable
  if (error.code && RETRYABLE_ERROR_CODES.has(error.code)) {
    return true;
  }

  // HTTP 5xx — retryable
  if (error.statusCode && RETRYABLE_STATUS_CODES.has(error.statusCode)) {
    return true;
  }

  // If the error is flagged as retryable by the provider
  if (error.isRetryable === true) {
    return true;
  }

  // Default: not retryable (safe — avoids double-charging)
  return false;
}

/**
 * Get the secondary gateway given a primary.
 */
function getSecondaryGateway(primary: PaymentGateway): PaymentGateway {
  return primary === 'stripe' ? 'payroo' : 'stripe';
}

/**
 * Check if a specific gateway is available (enabled and registered).
 */
function isGatewayAvailable(
  gateway: PaymentGateway,
  config: IGatewayConfig,
  providers: Map<PaymentGateway, IPaymentProvider>,
): boolean {
  if (!providers.has(gateway)) {
    return false;
  }
  if (gateway === 'stripe' && !config.stripeEnabled) {
    return false;
  }
  if (gateway === 'payroo' && !config.payrooEnabled) {
    return false;
  }
  return true;
}

/**
 * Core payment routing logic.
 * Selects gateway based on config.routingRule and handles fallback.
 *
 * Routing strategies:
 * - primary_only: Use primary gateway, no fallback
 * - fallback: Try primary, if retryable error -> try secondary
 * - round_robin: Alternate between gateways
 * - amount_based: Below threshold = primary, above = secondary
 */
export async function routePayment(
  params: CreateIntentParams,
  config: IGatewayConfig,
  providers: Map<PaymentGateway, IPaymentProvider>,
): Promise<PaymentIntentResult> {
  const { routingRule, primaryGateway, amountThreshold, fallbackTimeoutMs } = config;
  const secondary = getSecondaryGateway(primaryGateway);

  switch (routingRule) {
    case 'primary_only': {
      const provider = providers.get(primaryGateway);
      if (!provider || !isGatewayAvailable(primaryGateway, config, providers)) {
        throw createGatewayUnavailableError(primaryGateway);
      }
      return provider.createPaymentIntent(params);
    }

    case 'fallback': {
      const primaryProvider = providers.get(primaryGateway);
      if (!primaryProvider || !isGatewayAvailable(primaryGateway, config, providers)) {
        throw createGatewayUnavailableError(primaryGateway);
      }

      try {
        // Create a timeout race for the primary gateway
        const result = await withTimeout(
          primaryProvider.createPaymentIntent(params),
          fallbackTimeoutMs,
        );
        return result;
      } catch (err) {
        const gatewayErr = err as GatewayError;

        // PAY-INV-08: Only fall back on network errors, never business errors
        if (!isRetryable(gatewayErr)) {
          throw gatewayErr;
        }

        // Try secondary
        const secondaryProvider = providers.get(secondary);
        if (!secondaryProvider || !isGatewayAvailable(secondary, config, providers)) {
          throw gatewayErr; // No fallback available, throw original error
        }

        return secondaryProvider.createPaymentIntent(params);
      }
    }

    case 'round_robin': {
      const gateways: PaymentGateway[] = [];
      if (isGatewayAvailable(primaryGateway, config, providers)) {
        gateways.push(primaryGateway);
      }
      if (isGatewayAvailable(secondary, config, providers)) {
        gateways.push(secondary);
      }

      if (gateways.length === 0) {
        throw createGatewayUnavailableError(primaryGateway);
      }

      const selectedGateway = gateways[_roundRobinIndex % gateways.length];
      _roundRobinIndex++;

      const provider = providers.get(selectedGateway);
      if (!provider) {
        throw createGatewayUnavailableError(selectedGateway);
      }

      return provider.createPaymentIntent(params);
    }

    case 'amount_based': {
      const targetGateway = params.amount < amountThreshold ? primaryGateway : secondary;
      const provider = providers.get(targetGateway);

      if (!provider || !isGatewayAvailable(targetGateway, config, providers)) {
        // Fall back to whichever gateway is available
        const fallbackGateway = targetGateway === primaryGateway ? secondary : primaryGateway;
        const fallbackProvider = providers.get(fallbackGateway);
        if (!fallbackProvider || !isGatewayAvailable(fallbackGateway, config, providers)) {
          throw createGatewayUnavailableError(targetGateway);
        }
        return fallbackProvider.createPaymentIntent(params);
      }

      return provider.createPaymentIntent(params);
    }

    default: {
      throw new Error(`Unknown routing rule: ${routingRule as string}`);
    }
  }
}

/**
 * Reset round robin index. Useful for testing.
 */
export function resetRoundRobinIndex(): void {
  _roundRobinIndex = 0;
}

/**
 * Create a timeout wrapper for a promise.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err: GatewayError = new Error(`Gateway timeout after ${timeoutMs}ms`) as GatewayError;
      err.code = 'ETIMEDOUT';
      err.isRetryable = true;
      reject(err);
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function createGatewayUnavailableError(gateway: PaymentGateway): GatewayError {
  const err: GatewayError = new Error(
    `Payment gateway "${gateway}" is not available`,
  ) as GatewayError;
  err.code = 'GATEWAY_UNAVAILABLE';
  err.isRetryable = false;
  return err;
}
