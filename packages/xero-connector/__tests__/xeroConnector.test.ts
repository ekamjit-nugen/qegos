/**
 * @nugen/xero-connector Tests — Phase 2
 *
 * Validates:
 * - Types, constants, and configuration shapes
 * - Token encryption/decryption roundtrip (XRO-INV-01)
 * - GST calculation (XRO-INV-11)
 * - Rate limit constant (XRO-INV-03)
 * - Retry delays / exponential backoff (XRO-INV-05)
 * - Reconciliation threshold (XRO-INV-09)
 * - Validators
 * - Route factory exports
 */

import {
  XERO_SYNC_ENTITY_TYPES,
  XERO_SYNC_ACTIONS,
  XERO_SYNC_STATUSES,
  XERO_RATE_LIMIT_PER_MINUTE,
  RETRY_DELAYS_MS,
  MAX_RETRIES,
  RECONCILIATION_THRESHOLD_CENTS,
  DEFAULT_XERO_SCOPES,
  calculateGst,
} from '../src/types';

import type {
  XeroConnectorConfig,
  IXeroConfig,
  IXeroSyncLog,
  XeroSyncEntityType,
  XeroSyncStatus,
} from '../src/types';

import { encryptToken, decryptToken } from '../src/services/tokenService';

// Initialize tokenService with a test key before encrypt/decrypt tests
import { initTokenService } from '../src/services/tokenService';

import {
  validateConfigUpdate,
  validateSyncContact,
  validateOrderId,
  validateSyncLogId,
  validateSyncLogList,
  validateReconciliation,
  validateRecordPayment,
  validateCreditNote,
} from '../src/validators/xeroValidators';

import { createXeroRoutes } from '../src/routes/xeroRoutes';

// =============================================================================
// TYPES & CONSTANTS
// =============================================================================

describe('@nugen/xero-connector — Types & Constants', () => {
  test('sync entity types include 4 types', () => {
    expect(XERO_SYNC_ENTITY_TYPES).toHaveLength(4);
    expect(XERO_SYNC_ENTITY_TYPES).toEqual(
      expect.arrayContaining(['contact', 'invoice', 'payment', 'credit_note']),
    );
  });

  test('sync actions include 4 actions', () => {
    expect(XERO_SYNC_ACTIONS).toHaveLength(4);
    expect(XERO_SYNC_ACTIONS).toEqual(
      expect.arrayContaining(['create', 'update', 'void', 'delete']),
    );
  });

  test('sync statuses include 4 statuses', () => {
    expect(XERO_SYNC_STATUSES).toHaveLength(4);
    expect(XERO_SYNC_STATUSES).toEqual(
      expect.arrayContaining(['queued', 'processing', 'success', 'failed']),
    );
  });

  test('default scopes include required OAuth scopes', () => {
    expect(DEFAULT_XERO_SCOPES).toContain('openid');
    expect(DEFAULT_XERO_SCOPES).toContain('accounting.transactions');
    expect(DEFAULT_XERO_SCOPES).toContain('accounting.contacts');
    expect(DEFAULT_XERO_SCOPES).toContain('accounting.settings.read');
  });
});

// =============================================================================
// RATE LIMITING (XRO-INV-03)
// =============================================================================

describe('@nugen/xero-connector — Rate Limiting Constants', () => {
  test('XRO-INV-03: rate limit is 60 calls per minute', () => {
    expect(XERO_RATE_LIMIT_PER_MINUTE).toBe(60);
  });
});

// =============================================================================
// RETRY / EXPONENTIAL BACKOFF (XRO-INV-05)
// =============================================================================

describe('@nugen/xero-connector — Retry & Backoff', () => {
  test('XRO-INV-05: retry delays are 1min, 5min, 30min, 2hr', () => {
    expect(RETRY_DELAYS_MS).toHaveLength(4);
    expect(RETRY_DELAYS_MS[0]).toBe(60_000); // 1 minute
    expect(RETRY_DELAYS_MS[1]).toBe(300_000); // 5 minutes
    expect(RETRY_DELAYS_MS[2]).toBe(1_800_000); // 30 minutes
    expect(RETRY_DELAYS_MS[3]).toBe(7_200_000); // 2 hours
  });

  test('XRO-INV-05: max retries is 4', () => {
    expect(MAX_RETRIES).toBe(4);
  });

  test('retry delays are strictly increasing', () => {
    for (let i = 1; i < RETRY_DELAYS_MS.length; i++) {
      expect(RETRY_DELAYS_MS[i]).toBeGreaterThan(RETRY_DELAYS_MS[i - 1]);
    }
  });
});

// =============================================================================
// RECONCILIATION (XRO-INV-09)
// =============================================================================

describe('@nugen/xero-connector — Reconciliation', () => {
  test('XRO-INV-09: reconciliation threshold is 1 cent', () => {
    expect(RECONCILIATION_THRESHOLD_CENTS).toBe(1);
  });
});

// =============================================================================
// GST CALCULATION (XRO-INV-11)
// =============================================================================

describe('@nugen/xero-connector — GST Calculation', () => {
  test('XRO-INV-11: GST for $110.00 (11000 cents) is $10.00 (1000 cents)', () => {
    expect(calculateGst(11000)).toBe(1000);
  });

  test('XRO-INV-11: GST for $165.00 (16500 cents) is $15.00 (1500 cents)', () => {
    expect(calculateGst(16500)).toBe(1500);
  });

  test('XRO-INV-11: GST for $55.00 (5500 cents) is $5.00 (500 cents)', () => {
    expect(calculateGst(5500)).toBe(500);
  });

  test('XRO-INV-11: GST for $100.00 (10000 cents) rounds correctly', () => {
    // 10000 / 11 = 909.09... → rounds to 909
    expect(calculateGst(10000)).toBe(909);
  });

  test('GST is always an integer (cents)', () => {
    const testAmounts = [5500, 11000, 16500, 22000, 10000, 7777, 12345];
    for (const amount of testAmounts) {
      expect(Number.isInteger(calculateGst(amount))).toBe(true);
    }
  });

  test('GST for $0 is $0', () => {
    expect(calculateGst(0)).toBe(0);
  });
});

// =============================================================================
// TOKEN ENCRYPTION (XRO-INV-01)
// =============================================================================

describe('@nugen/xero-connector — Token Encryption', () => {
  beforeAll(() => {
    // Initialize with a test encryption key
    initTokenService(
      'test-encryption-key-32-chars-ok!',
      {} as any, // Redis mock not needed for encrypt/decrypt
      {} as any, // Model mock not needed
    );
  });

  test('XRO-INV-01: encrypt/decrypt roundtrip preserves token', () => {
    const originalToken = 'xero_access_token_abc123def456';
    const encrypted = encryptToken(originalToken);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(originalToken);
  });

  test('XRO-INV-01: encrypted format is iv:authTag:ciphertext', () => {
    const encrypted = encryptToken('test-token');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);

    // IV is 12 bytes = 24 hex chars
    expect(parts[0]).toHaveLength(24);
    // Auth tag is 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
    // Ciphertext is non-empty hex
    expect(parts[2].length).toBeGreaterThan(0);
    expect(/^[0-9a-f]+$/.test(parts[2])).toBe(true);
  });

  test('XRO-INV-01: same plaintext produces different ciphertexts (random IV)', () => {
    const token = 'same-token-value';
    const encrypted1 = encryptToken(token);
    const encrypted2 = encryptToken(token);
    expect(encrypted1).not.toBe(encrypted2);

    // But both decrypt to the same value
    expect(decryptToken(encrypted1)).toBe(token);
    expect(decryptToken(encrypted2)).toBe(token);
  });

  test('XRO-INV-01: empty string encrypts and decrypts', () => {
    const encrypted = encryptToken('');
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe('');
  });

  test('XRO-INV-01: long token encrypts and decrypts', () => {
    const longToken = 'a'.repeat(2000);
    const encrypted = encryptToken(longToken);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(longToken);
  });
});

// =============================================================================
// VALIDATORS
// =============================================================================

describe('@nugen/xero-connector — Validators', () => {
  test('validateConfigUpdate returns 4 chains', () => {
    expect(validateConfigUpdate()).toHaveLength(4);
  });

  test('validateSyncContact returns 1 chain', () => {
    expect(validateSyncContact()).toHaveLength(1);
  });

  test('validateOrderId returns 1 chain', () => {
    expect(validateOrderId()).toHaveLength(1);
  });

  test('validateSyncLogId returns 1 chain', () => {
    expect(validateSyncLogId()).toHaveLength(1);
  });

  test('validateSyncLogList returns 6 chains for pagination + filters', () => {
    expect(validateSyncLogList()).toHaveLength(6);
  });

  test('validateReconciliation returns 2 chains', () => {
    expect(validateReconciliation()).toHaveLength(2);
  });

  test('validateRecordPayment returns 1 chain', () => {
    expect(validateRecordPayment()).toHaveLength(1);
  });

  test('validateCreditNote returns 3 chains', () => {
    expect(validateCreditNote()).toHaveLength(3);
  });
});

// =============================================================================
// ROUTES
// =============================================================================

describe('@nugen/xero-connector — Routes', () => {
  test('createXeroRoutes is a function', () => {
    expect(typeof createXeroRoutes).toBe('function');
  });
});

// =============================================================================
// CROSS-INVARIANT CHECKS
// =============================================================================

describe('@nugen/xero-connector — Invariant Summary', () => {
  test('XRO-INV-03 + XRO-INV-05 constants are consistent', () => {
    // Rate limit exists and retries have correct count
    expect(XERO_RATE_LIMIT_PER_MINUTE).toBeGreaterThan(0);
    expect(RETRY_DELAYS_MS.length).toBe(MAX_RETRIES);
  });

  test('XRO-INV-09: threshold is in cents (integer)', () => {
    expect(Number.isInteger(RECONCILIATION_THRESHOLD_CENTS)).toBe(true);
  });

  test('XRO-INV-11: GST formula verified against known ATO examples', () => {
    // $110 inc GST → $10 GST
    expect(calculateGst(11000)).toBe(1000);
    // $220 inc GST → $20 GST
    expect(calculateGst(22000)).toBe(2000);
    // $330 inc GST → $30 GST
    expect(calculateGst(33000)).toBe(3000);
  });
});
