import crypto from 'crypto';
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

interface PayrooProviderConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  publicKey: string;
}

let _config: PayrooProviderConfig | null = null;

/**
 * Initialize the Payroo provider with configuration.
 */
export function initPayrooProvider(config: PayrooProviderConfig): void {
  _config = config;
}

function getConfig(): PayrooProviderConfig {
  if (!_config) {
    throw new Error('Payroo provider not initialized. Call initPayrooProvider first.');
  }
  return _config;
}

/**
 * Generate HMAC-SHA256 signature for Payroo API requests.
 */
function signRequest(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Generic Payroo API HTTP client.
 */
async function payrooRequest<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  const config = getConfig();
  const url = `${config.baseUrl}${path}`;
  const bodyStr = body ? JSON.stringify(body) : '';
  const signature = signRequest(bodyStr, config.apiSecret);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Payroo-Api-Key': config.apiKey,
    'X-Payroo-Signature': signature,
  };

  if (idempotencyKey) {
    headers['X-Idempotency-Key'] = idempotencyKey;
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(30000), // 30s timeout
  };

  if (body && method !== 'GET') {
    fetchOptions.body = bodyStr;
  }

  let response: Response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (err) {
    const gatewayErr: GatewayError = new Error(
      `Payroo network error: ${(err as Error).message}`,
    ) as GatewayError;
    gatewayErr.code = (err as NodeJS.ErrnoException).code ?? 'ECONNREFUSED';
    gatewayErr.isRetryable = true;
    throw gatewayErr;
  }

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const gatewayErr: GatewayError = new Error(
      (data.message as string) ?? `Payroo error: ${response.status}`,
    ) as GatewayError;
    gatewayErr.code = (data.code as string) ?? undefined;
    gatewayErr.type = (data.type as string) ?? undefined;
    gatewayErr.statusCode = response.status;
    gatewayErr.isRetryable = response.status >= 500;
    throw gatewayErr;
  }

  return data as T;
}

interface PayrooIntentResponse {
  transactionId: string;
  clientSecret: string;
  status: string;
}

interface PayrooCaptureResponse {
  transactionId: string;
  capturedAmount: number;
  status: string;
}

interface PayrooCancelResponse {
  transactionId: string;
  status: string;
}

interface PayrooRefundResponse {
  refundId: string;
  amount: number;
  status: string;
}

interface PayrooStatusResponse {
  transactionId: string;
  status: string;
  amount: number;
  capturedAmount: number;
  refundedAmount: number;
}

/**
 * Payroo implementation of IPaymentProvider.
 * Uses HMAC-SHA256 signed HTTP requests.
 */
export const payrooProvider: IPaymentProvider = {
  name: 'payroo',

  async createPaymentIntent(params: CreateIntentParams): Promise<PaymentIntentResult> {
    const config = getConfig();
    const result = await payrooRequest<PayrooIntentResponse>(
      'POST',
      '/v1/payments/intents',
      {
        amount: params.amount,
        currency: params.currency,
        orderId: params.orderId,
        userId: params.userId,
        metadata: params.metadata,
      },
      params.idempotencyKey,
    );

    return {
      gatewayTxnId: result.transactionId,
      clientSecret: result.clientSecret,
      gateway: 'payroo',
      publishableKey: config.publicKey,
      status: result.status,
    };
  },

  async capturePayment(params: CaptureParams): Promise<CaptureResult> {
    const result = await payrooRequest<PayrooCaptureResponse>(
      'POST',
      `/v1/payments/${params.gatewayTxnId}/capture`,
      { amount: params.amount },
    );

    return {
      gatewayTxnId: result.transactionId,
      capturedAmount: result.capturedAmount,
      status: result.status,
    };
  },

  async cancelPayment(params: CancelParams): Promise<CancelResult> {
    try {
      const result = await payrooRequest<PayrooCancelResponse>(
        'POST',
        `/v1/payments/${params.gatewayTxnId}/cancel`,
        params.reason ? { reason: params.reason } : undefined,
      );
      return {
        gatewayTxnId: result.transactionId,
        status: result.status,
      };
    } catch (err) {
      // Idempotent compensation: if Payroo says the intent is missing
      // (already cleaned up) or in a state that disallows cancel
      // (already cancelled / settled), treat as success — the saga
      // outcome is the same. Other errors propagate.
      const gatewayErr = err as GatewayError;
      if (gatewayErr.statusCode === 404 || gatewayErr.statusCode === 409) {
        return {
          gatewayTxnId: params.gatewayTxnId,
          status: 'cancelled',
        };
      }
      throw err;
    }
  },

  async refundPayment(params: RefundParams): Promise<RefundResult> {
    const result = await payrooRequest<PayrooRefundResponse>(
      'POST',
      `/v1/payments/${params.gatewayTxnId}/refunds`,
      {
        amount: params.amount,
        reason: params.reason,
      },
      params.idempotencyKey,
    );

    return {
      gatewayRefundId: result.refundId,
      amount: result.amount,
      status: result.status,
    };
  },

  async getPaymentStatus(gatewayTxnId: string): Promise<PaymentStatusResult> {
    const result = await payrooRequest<PayrooStatusResponse>('GET', `/v1/payments/${gatewayTxnId}`);

    return {
      gatewayTxnId: result.transactionId,
      status: result.status,
      amount: result.amount,
      capturedAmount: result.capturedAmount,
      refundedAmount: result.refundedAmount,
    };
  },

  async testConnection(): Promise<boolean> {
    try {
      await payrooRequest<Record<string, unknown>>('GET', '/v1/health');
      return true;
    } catch {
      return false;
    }
  },
};
