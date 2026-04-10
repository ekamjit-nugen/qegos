/**
 * Consent Form — Field-level AES-256-GCM encryption helpers.
 *
 * Mirrors the `encryptTfn` pattern in user.model.ts / order.model.ts so
 * the key material and envelope format stay consistent across modules.
 *
 * Envelope format (all hex, colon-separated):
 *   `${iv}:${authTag}:${ciphertext}`
 *
 * Key: `config.ENCRYPTION_KEY` is a 64-char hex string (= 32 bytes)
 * loaded by Zod-validated env.ts. Decryption is deliberately NOT wired
 * into any HTTP handler — the only caller is a future ATO-lodgement
 * script that holds the key out-of-band.
 */

import crypto from 'crypto';
import { getConfig } from '../../config/env';
import type { EncryptedField } from './consentForm.types';

function getKey(): Buffer {
  const config = getConfig();
  return Buffer.from(config.ENCRYPTION_KEY, 'hex');
}

/**
 * Encrypt a UTF-8 plaintext string into the canonical envelope format.
 * Returns ciphertext — never the plaintext — and never logs the input.
 */
export function encryptField(plaintext: string): EncryptedField {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('encryptField: plaintext must be a non-empty string');
  }
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an envelope back to UTF-8 plaintext. INTENTIONALLY NOT
 * re-exported through the module index — callers must import this file
 * directly, making it obvious in code review whenever plaintext is
 * materialised.
 */
export function decryptField(envelope: EncryptedField): string {
  const parts = envelope.split(':');
  if (parts.length !== 3) {
    throw new Error('decryptField: malformed envelope');
  }
  const [ivHex, authTagHex, encrypted] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Return the last N characters of a digit string. For shorter strings,
 * returns the whole string. Used so the admin UI can display a stable
 * "ending in 1234" identifier without ever holding ciphertext.
 */
export function last4(value: string): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return digits.slice(-4);
}

/**
 * Parse a YYYY-MM-DD date string and return the year component.
 * Used as the "display projection" for DOB — the year is kept in
 * plaintext so that an admin can eyeball the demographic without
 * needing to decrypt the full date.
 */
export function yearFromDob(dateOfBirth: string): number {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(dateOfBirth);
  if (!match) {
    throw new Error('yearFromDob: expected YYYY-MM-DD');
  }
  return Number(match[1]);
}
