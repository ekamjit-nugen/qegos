import * as bcrypt from 'bcryptjs';
import type { AuthConfig, PasswordPolicy } from '../types';

let _config: AuthConfig | null = null;

export function initPasswordService(config: AuthConfig): void {
  _config = config;
}

function getConfig(): AuthConfig {
  if (!_config) {
    throw new Error('Password service not initialized. Call initPasswordService(config) first.');
  }
  return _config;
}

/**
 * Hash a password using bcrypt at configured cost factor (SEC-INV-07: cost 12).
 */
export async function hashPassword(password: string): Promise<string> {
  const config = getConfig();
  return bcrypt.hash(password, config.bcryptRounds);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Validate password against configurable policy (SEC-INV-07).
 * Returns an array of validation error messages. Empty array = valid.
 */
export function validatePolicy(password: string): string[] {
  const config = getConfig();
  const policy: PasswordPolicy = config.passwordPolicy;
  const errors: string[] = [];

  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (policy.requireNumber && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (policy.requireSpecial && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return errors;
}
