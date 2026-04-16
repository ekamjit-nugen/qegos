import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { Model } from 'mongoose';
import type { Redis } from 'ioredis';
import type { IXeroConfigDocument } from '../types';

// ─── Module State ───────────────────────────────────────────────────────────

let encryptionKey: Buffer;
let redisClient: Redis;
let XeroConfigModel: Model<IXeroConfigDocument>;

const REFRESH_LOCK_KEY = 'xero:token:refresh:lock';
const REFRESH_LOCK_TTL_SECONDS = 5;

export function initTokenService(
  key: string,
  redis: Redis,
  configModel: Model<IXeroConfigDocument>,
): void {
  // Derive 32-byte key from provided string
  encryptionKey = Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf8');
  redisClient = redis;
  XeroConfigModel = configModel;
}

// ─── AES-256-GCM Encryption (XRO-INV-01) ─────────────────────────────────

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns "iv:authTag:ciphertext" as hex.
 * Pattern matches @nugen/chat-engine tfnRedaction.ts
 */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt ciphertext from "iv:authTag:ciphertext" format.
 */
export function decryptToken(encrypted: string): string {
  const [ivHex, authTagHex, ciphertext] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ─── Token Storage ────────────────────────────────────────────────────────

/**
 * Store encrypted tokens in the singleton XeroConfig document.
 */
export async function storeTokens(
  accessToken: string,
  refreshToken: string,
  expiresAt: Date,
  tenantId: string,
): Promise<void> {
  const encryptedAccess = encryptToken(accessToken);
  const encryptedRefresh = encryptToken(refreshToken);

  await XeroConfigModel.findOneAndUpdate(
    {},
    {
      $set: {
        xeroConnected: true,
        xeroTenantId: tenantId,
        xeroAccessToken: encryptedAccess,
        xeroRefreshToken: encryptedRefresh,
        xeroTokenExpiresAt: expiresAt,
        syncErrorCount: 0,
      },
    },
    { upsert: true },
  );
}

/**
 * Get decrypted tokens from XeroConfig.
 * Uses select('+xeroAccessToken +xeroRefreshToken') to include hidden fields.
 */
export async function getDecryptedTokens(): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  tenantId: string;
} | null> {
  const config = await XeroConfigModel.findOne()
    .select('+xeroAccessToken +xeroRefreshToken')
    .lean();

  if (!config?.xeroAccessToken || !config?.xeroRefreshToken) {
    return null;
  }

  return {
    accessToken: decryptToken(config.xeroAccessToken),
    refreshToken: decryptToken(config.xeroRefreshToken),
    expiresAt: config.xeroTokenExpiresAt!,
    tenantId: config.xeroTenantId!,
  };
}

// ─── Token Refresh with Distributed Lock (XRO-INV-02) ─────────────────────

/**
 * Refresh the Xero access token if it's about to expire (within 2 minutes).
 * Uses Redis SETNX for distributed lock to prevent race conditions.
 * Returns refreshed tokens or existing tokens if not expired.
 */
export async function refreshTokenIfNeeded(
  refreshFn: (refreshToken: string) => Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }>,
): Promise<{ accessToken: string; tenantId: string } | null> {
  const tokens = await getDecryptedTokens();
  if (!tokens) {
    return null;
  }

  const twoMinutesFromNow = new Date(Date.now() + 2 * 60 * 1000);

  // If token is still valid, return it
  if (tokens.expiresAt > twoMinutesFromNow) {
    return { accessToken: tokens.accessToken, tenantId: tokens.tenantId };
  }

  // Try to acquire distributed lock (XRO-INV-02)
  const lockValue = randomBytes(16).toString('hex');
  const lockAcquired = await redisClient.set(
    REFRESH_LOCK_KEY,
    lockValue,
    'EX',
    REFRESH_LOCK_TTL_SECONDS,
    'NX',
  );

  if (!lockAcquired) {
    // Another process is refreshing — wait and retry
    for (let i = 0; i < 5; i++) {
      await sleep(200);
      const freshTokens = await getDecryptedTokens();
      if (freshTokens && freshTokens.expiresAt > twoMinutesFromNow) {
        return { accessToken: freshTokens.accessToken, tenantId: freshTokens.tenantId };
      }
    }
    // Still expired after waiting — attempt our own refresh
  }

  try {
    const refreshed = await refreshFn(tokens.refreshToken);
    const expiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);

    await storeTokens(refreshed.accessToken, refreshed.refreshToken, expiresAt, tokens.tenantId);

    return { accessToken: refreshed.accessToken, tenantId: tokens.tenantId };
  } finally {
    // Release lock only if we still own it
    const currentValue = await redisClient.get(REFRESH_LOCK_KEY);
    if (currentValue === lockValue) {
      await redisClient.del(REFRESH_LOCK_KEY);
    }
  }
}

/**
 * Disconnect: clear tokens and set xeroConnected=false.
 */
export async function clearTokens(): Promise<void> {
  await XeroConfigModel.findOneAndUpdate(
    {},
    {
      $set: {
        xeroConnected: false,
        xeroAccessToken: undefined,
        xeroRefreshToken: undefined,
        xeroTokenExpiresAt: undefined,
        xeroTenantId: undefined,
      },
    },
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
