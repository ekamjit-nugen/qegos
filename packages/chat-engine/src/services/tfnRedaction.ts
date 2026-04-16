import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { TFN_PATTERN, TFN_REPLACEMENT } from '../types';

// ─── Module State ───────────────────────────────────────────────────────────

let encryptionKey: Buffer;

export function initTfnRedaction(key: string): void {
  // Derive 32-byte key from provided string
  encryptionKey = Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf8');
}

// ─── TFN Detection (CHT-INV-01) ────────────────────────────────────────────

/**
 * Check if content contains a TFN-like pattern (9 consecutive digits).
 */
export function containsTfn(content: string): boolean {
  TFN_PATTERN.lastIndex = 0;
  return TFN_PATTERN.test(content);
}

/**
 * Redact TFN patterns from content, replacing with *** *** ***.
 */
export function redactTfn(content: string): string {
  // Reset lastIndex since TFN_PATTERN is global
  TFN_PATTERN.lastIndex = 0;
  return content.replace(TFN_PATTERN, TFN_REPLACEMENT);
}

// ─── Encryption for contentOriginal (AES-256-GCM) ──────────────────────────

/**
 * Encrypt original content containing TFN for secure storage.
 * Returns "iv:authTag:ciphertext" as hex.
 */
export function encryptContent(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt contentOriginal back to plaintext.
 */
export function decryptContent(encrypted: string): string {
  const [ivHex, authTagHex, ciphertext] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Process a message: redact TFN in content, encrypt original if TFN detected.
 * Returns { content, contentOriginal? }
 */
export function processMessageContent(rawContent: string): {
  content: string;
  contentOriginal?: string;
} {
  TFN_PATTERN.lastIndex = 0;
  if (!containsTfn(rawContent)) {
    return { content: rawContent };
  }

  return {
    content: redactTfn(rawContent),
    contentOriginal: encryptContent(rawContent),
  };
}
