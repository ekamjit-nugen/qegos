import crypto from 'crypto';
import type {
  IPaymentProvider,
  CreateIntentParams,
  PaymentIntentResult,
  CaptureParams,
  CaptureResult,
  RefundParams,
  RefundResult,
  PaymentStatusResult,
  GatewayError,
} from '../types';

interface PayzooProviderConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  publicKey: string;
}

let _config: PayzooProviderConfig | null = null;

/**
 * Initialize the Payzoo provider with configuration.
 */
export function initPayzooProvider(config: PayzooProviderConfig): void {
  _config = config;
}

function getConfig(): PayzooProviderConfig {
  if (!_config) {
    throw new Error('Payzoo provider not initialized. Call initPayzooProvider first.');
  }
  return _config;
}

/**
 * Generate HMAC-SHA256 signature for Payzoo API requests.
 */
function signRequest(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Generic Payzoo API HTTP client.
 */
async function payzooRequest<T>(
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
    'X-Payzoo-Api-Key': config.apiKey,
    'X-Payzoo-Signature': signature,
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
      `Payzoo network error: ${(err as Error).message}`,
    ) as GatewayError;
    gatewayErr.code = (err as NodeJS.ErrnoException).code ?? 'ECONNREFUSED';
    gatewayErr.isRetryable = true;
    throw gatewayErr;
  }

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const gatewayErr: GatewayError = new Error(
      (data.message as string) ?? `Payzoo error: ${response.status}`,
    ) as GatewayError;
    gatewayErr.code = (data.code as string) ?? undefined;
    gatewayErr.type = (data.type as string) ?? undefined;
    gatewayErr.statusCode = response.status;
    gatewayErr.isRetryable = response.status >= 500;
    throw gatewayErr;
  }

  return data as T;
}

interface PayzooIntentResponse {
  transactionId: string;
  clientSecret: string;
  status: string;
}

interface PayzooCaptureResponse {
  transactionId: string;
  capturedAmount: number;
  status: string;
}

interface PayzooRefundResponse {
  refundId: string;
  amount: number;
  status: string;
}

interface PayzooStatusResponse {
  transactionId: string;
  status: string;
  amount: number;
  capturedAmount: number;
  refundedAmount: number;
}

/**
 * Payzoo implementation of IPaymentProvider.
 * Uses HMAC-SHA256 signed HTTP requests.
 */
export const payzooProvider: IPaymentProvider = {
  name: 'payzoo',

  async createPaymentIntent(params: CreateIntentParams): Promise<PaymentIntentResult> {
    const config = getConfig();
    const result = await payzooRequest<PayzooIntentResponse>(
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
      gateway: 'payzoo',
      publishableKey: config.publicKey,
      status: result.status,
    };
  },

  async capturePayment(params: CaptureParams): Promise<CaptureResult> {
    const result = await payzooRequest<PayzooCaptureResponse>(
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

  async refundPayment(params: RefundParams): Promise<RefundResult> {
    const result = await payzooRequest<PayzooRefundResponse>(
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
    const result = await payzooRequest<PayzooStatusResponse>(
      'GET',
      `/v1/payments/${gatewayTxnId}`,
    );

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
      await payzooRequest<Record<string, unknown>>('GET', '/v1/health');
      return true;
    } catch {
      return false;
    }
  },
};
