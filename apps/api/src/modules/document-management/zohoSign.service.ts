import * as crypto from 'crypto';
import type {
  ZohoSignConfig,
  ZohoSignRecipient,
  ZohoTokenResponse,
  ZohoCreateResponse,
} from './document.types';

// ─── Module State ──────────────────────────────────────────────────────────

let config: ZohoSignConfig;
let accessToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Initialize the Zoho Sign service with OAuth credentials.
 */
export function initZohoSignService(cfg: ZohoSignConfig): void {
  config = cfg;
  accessToken = null;
  tokenExpiresAt = 0;
}

// ─── OAuth Token Management ────────────────────────────────────────────────

/**
 * Refresh the Zoho Sign OAuth access token using the stored refresh token.
 * Caches the token with a 60s safety buffer before expiry.
 */
async function refreshAccessToken(): Promise<string> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
  });

  const response = await fetch('https://accounts.zoho.com.au/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Zoho token refresh failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as ZohoTokenResponse;
  accessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000; // 60s safety buffer
  return accessToken;
}

/**
 * Get a valid access token, refreshing if expired.
 */
export async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiresAt) {
    return accessToken;
  }
  return refreshAccessToken();
}

// ─── Zoho Sign API Methods ─────────────────────────────────────────────────

/**
 * Create a signing request in Zoho Sign.
 * Uploads a document and sets up recipients.
 */
export async function createSigningRequest(params: {
  fileName: string;
  fileBuffer: Buffer;
  recipients: ZohoSignRecipient[];
}): Promise<{ requestId: string; actions: Array<{ actionId: string; recipientEmail: string }> }> {
  const token = await getAccessToken();
  const { FormData, Blob } = await import('node:buffer').then(() => ({
    FormData: globalThis.FormData,
    Blob: globalThis.Blob,
  }));

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(params.fileBuffer)], { type: 'application/pdf' });
  formData.append('file', blob, params.fileName);

  const requestData = {
    requests: {
      request_name: params.fileName,
      actions: params.recipients.map((r) => ({
        recipient_name: r.recipient_name,
        recipient_email: r.recipient_email,
        action_type: r.action_type,
        verify_recipient: false,
        ...(r.signing_order !== undefined ? { signing_order: r.signing_order } : {}),
      })),
    },
  };
  formData.append('data', JSON.stringify(requestData));

  const response = await fetch(`${config.baseUrl}/api/v1/requests`, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Zoho createSigningRequest failed: ${response.status}`);
  }

  const data = (await response.json()) as ZohoCreateResponse;
  return {
    requestId: data.requests.request_id,
    actions: data.requests.actions.map((a) => ({
      actionId: a.action_id,
      recipientEmail: a.recipient_email,
    })),
  };
}

/**
 * Submit a signing request for signatures.
 */
export async function sendForSignature(requestId: string): Promise<void> {
  const token = await getAccessToken();

  const response = await fetch(`${config.baseUrl}/api/v1/requests/${requestId}/submit`, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Zoho sendForSignature failed: ${response.status}`);
  }
}

/**
 * Generate an embedded signing URL for in-app iframe signing.
 */
export async function generateEmbeddedSigningUri(
  requestId: string,
  actionId: string,
): Promise<{ signUrl: string }> {
  const token = await getAccessToken();

  const response = await fetch(
    `${config.baseUrl}/api/v1/requests/${requestId}/actions/${actionId}/embedtoken`,
    {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    },
  );

  if (!response.ok) {
    throw new Error(`Zoho generateEmbeddedSigningUri failed: ${response.status}`);
  }

  const data = (await response.json()) as { sign_url: string };
  return { signUrl: data.sign_url };
}

/**
 * Download a signed document PDF from Zoho Sign.
 */
export async function getSignedDocument(requestId: string, documentId: string): Promise<Buffer> {
  const token = await getAccessToken();

  const response = await fetch(
    `${config.baseUrl}/api/v1/requests/${requestId}/documents/${documentId}/pdf`,
    {
      method: 'GET',
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    },
  );

  if (!response.ok) {
    throw new Error(`Zoho getSignedDocument failed: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

// ─── Webhook Verification ──────────────────────────────────────────────────

/**
 * Verify Zoho Sign webhook signature using HMAC-SHA256.
 */
export function verifyWebhookSignature(payload: string, signature: string): boolean {
  if (!config.webhookSecret) {
    return false;
  }
  const expected = crypto.createHmac('sha256', config.webhookSecret).update(payload).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expBuf, sigBuf);
}
