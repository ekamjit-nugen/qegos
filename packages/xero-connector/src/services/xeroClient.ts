import type { Model } from 'mongoose';
import type { Redis } from 'ioredis';
import type { IXeroConfigDocument, XeroConnectorConfig } from '../types';
import { XERO_RATE_LIMIT_PER_MINUTE } from '../types';
import { refreshTokenIfNeeded } from './tokenService';

// ─── Module State ───────────────────────────────────────────────────────────

let redisClient: Redis;
let XeroConfigModel: Model<IXeroConfigDocument>;
let connectorConfig: XeroConnectorConfig;

export function initXeroClient(
  config: XeroConnectorConfig,
  redis: Redis,
  configModel: Model<IXeroConfigDocument>,
): void {
  connectorConfig = config;
  redisClient = redis;
  XeroConfigModel = configModel;
}

// ─── OAuth URL Generation ─────────────────────────────────────────────────

export function getAuthorizeUrl(state: string): string {
  const scopes = connectorConfig.xeroScopes.join(' ');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: connectorConfig.xeroClientId,
    redirect_uri: connectorConfig.xeroRedirectUri,
    scope: scopes,
    state,
  });
  return `https://login.xero.com/identity/connect/authorize?${params.toString()}`;
}

// ─── Token Exchange ───────────────────────────────────────────────────────

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tenantId: string;
}> {
  const basicAuth = Buffer.from(
    `${connectorConfig.xeroClientId}:${connectorConfig.xeroClientSecret}`,
  ).toString('base64');

  const response = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: connectorConfig.xeroRedirectUri,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Xero token exchange failed: ${response.status} ${errBody}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Get tenant ID from connections endpoint
  const connectionsRes = await fetch('https://api.xero.com/connections', {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const connections = await connectionsRes.json() as Array<{ tenantId: string }>;
  const tenantId = connections[0]?.tenantId ?? '';

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tenantId,
  };
}

// ─── Refresh Token Helper ─────────────────────────────────────────────────

async function doRefresh(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const basicAuth = Buffer.from(
    `${connectorConfig.xeroClientId}:${connectorConfig.xeroClientSecret}`,
  ).toString('base64');

  const response = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Xero token refresh failed: ${response.status}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

// ─── Rate Limiting (XRO-INV-03) ──────────────────────────────────────────

async function checkRateLimit(tenantId: string): Promise<void> {
  const key = `xero:rate:${tenantId}`;
  const count = await redisClient.incr(key);

  if (count === 1) {
    // First call this minute — set TTL
    await redisClient.expire(key, 60);
  }

  if (count > XERO_RATE_LIMIT_PER_MINUTE) {
    const ttl = await redisClient.ttl(key);
    const delayMs = (ttl > 0 ? ttl : 1) * 1000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

// ─── Authenticated API Call Wrapper ───────────────────────────────────────

/**
 * Execute an authenticated Xero API call with rate limiting and auto-refresh.
 * XRO-INV-03: Rate limited to 60/min per tenant.
 * XRO-INV-02: Token refresh with distributed lock.
 * XRO-INV-10: If auth fails persistently, marks xeroConnected=false.
 */
export async function callXeroApi<T>(
  apiFn: (accessToken: string, tenantId: string) => Promise<T>,
): Promise<T> {
  // Check connection status
  const config = await XeroConfigModel.findOne().lean();
  if (!config?.xeroConnected) {
    throw new XeroOfflineError('Xero is not connected');
  }

  // Refresh token if needed (XRO-INV-02)
  const result = await refreshTokenIfNeeded(doRefresh);
  if (!result) {
    throw new XeroOfflineError('No valid Xero tokens available');
  }

  // Rate limit (XRO-INV-03)
  await checkRateLimit(result.tenantId);

  try {
    return await apiFn(result.accessToken, result.tenantId);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;

    // If 401, token might be stale — try one more refresh
    if (status === 401) {
      const refreshed = await refreshTokenIfNeeded(doRefresh);
      if (refreshed) {
        try {
          return await apiFn(refreshed.accessToken, refreshed.tenantId);
        } catch {
          // XRO-INV-10: Persistent auth failure → mark disconnected
          await XeroConfigModel.findOneAndUpdate({}, { $set: { xeroConnected: false } });
          throw new XeroOfflineError('Xero authentication failed. Re-authorization required.');
        }
      }
    }

    throw err;
  }
}

// ─── Connection Status ────────────────────────────────────────────────────

export async function getConnectionStatus(): Promise<{
  connected: boolean;
  tenantId?: string;
  tokenExpiresAt?: Date;
  lastSyncAt?: Date;
  syncErrorCount: number;
}> {
  const config = await XeroConfigModel.findOne().lean();
  if (!config) {
    return { connected: false, syncErrorCount: 0 };
  }

  return {
    connected: config.xeroConnected,
    tenantId: config.xeroTenantId,
    tokenExpiresAt: config.xeroTokenExpiresAt,
    lastSyncAt: config.lastSyncAt,
    syncErrorCount: config.syncErrorCount,
  };
}

// ─── Fetch Xero Reference Data ────────────────────────────────────────────

export async function getChartOfAccounts(): Promise<unknown[]> {
  return callXeroApi(async (accessToken, tenantId) => {
    const res = await fetch('https://api.xero.com/api.xro/2.0/Accounts', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Xero-Tenant-Id': tenantId,
        Accept: 'application/json',
      },
    });
    const data = await res.json() as { Accounts: unknown[] };
    return data.Accounts ?? [];
  });
}

export async function getTaxRates(): Promise<unknown[]> {
  return callXeroApi(async (accessToken, tenantId) => {
    const res = await fetch('https://api.xero.com/api.xro/2.0/TaxRates', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Xero-Tenant-Id': tenantId,
        Accept: 'application/json',
      },
    });
    const data = await res.json() as { TaxRates: unknown[] };
    return data.TaxRates ?? [];
  });
}

// ─── Custom Error Classes ─────────────────────────────────────────────────

export class XeroOfflineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XeroOfflineError';
  }
}
