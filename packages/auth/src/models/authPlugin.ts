import type { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import type { IAuthFields, AuthConfig } from '../types';

let _config: AuthConfig | null = null;

export function initAuthPlugin(config: AuthConfig): void {
  _config = config;
}

/**
 * Mongoose plugin that adds auth fields to any schema.
 * Consuming models extend IAuthFields interface.
 *
 * Fields added:
 * - password (bcrypt hashed on save)
 * - refreshTokens (array of hashed tokens per device)
 * - failedLoginAttempts + accountLockedUntil (lockout)
 * - lastLoginAt, lastLoginIp
 * - passwordChangedAt (JWT invalidation after change, SEC-INV-05)
 * - mfaEnabled, mfaSecret, mfaBackupCodes (hashed, FIX S-3)
 * - passwordResetToken, passwordResetExpires
 */
export function authPlugin(schema: Schema): void {
  schema.add({
    password: { type: String, select: false },
    refreshTokens: {
      type: [
        {
          token: { type: String, required: true },
          deviceId: { type: String, required: true },
          userAgent: { type: String, default: '' },
          ipAddress: { type: String, default: '' },
          createdAt: { type: Date, default: Date.now },
          expiresAt: { type: Date, required: true },
        },
      ],
      default: [],
      select: false,
    },
    failedLoginAttempts: { type: Number, default: 0 },
    accountLockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: null },
    passwordChangedAt: { type: Date, default: null },
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String, default: null, select: false },
    mfaBackupCodes: { type: [String], default: [], select: false },
    passwordResetToken: { type: String, default: null, select: false },
    passwordResetExpires: { type: Date, default: null },
  });

  // Hash password before save (SEC-INV-07)
  schema.pre('save', async function (next) {
    if (!this.isModified('password') || !this.get('password')) {
      return next();
    }
    const rounds = _config?.bcryptRounds ?? 12;
    const hashed = await bcrypt.hash(this.get('password') as string, rounds);
    this.set('password', hashed);

    // Set passwordChangedAt for JWT invalidation (SEC-INV-05)
    if (!this.isNew) {
      this.set('passwordChangedAt', new Date(Date.now() - 1000));
    }
    next();
  });

  // Instance method: compare password
  schema.methods.isCorrectPassword = async function (password: string): Promise<boolean> {
    if (!this.password) {
      return false;
    }
    return bcrypt.compare(password, this.password as string);
  };

  // Instance method: check if account is locked
  schema.methods.isAccountLocked = function (): boolean {
    const lockedUntil = this.get('accountLockedUntil') as Date | null;
    if (!lockedUntil) {
      return false;
    }
    return lockedUntil > new Date();
  };

  // Instance method: increment failed attempts, lock after threshold (SEC-INV-02)
  // Fix for S-3.20: Use configurable values instead of hardcoded magic numbers
  schema.methods.incrementFailedAttempts = async function (): Promise<void> {
    const attempts = (this.get('failedLoginAttempts') as number) + 1;
    this.set('failedLoginAttempts', attempts);
    const maxAttempts = _config?.maxFailedLoginAttempts ?? 10;
    if (attempts >= maxAttempts) {
      const lockoutMs = _config?.lockoutDurationMs ?? 30 * 60 * 1000;
      this.set('accountLockedUntil', new Date(Date.now() + lockoutMs));
    }
    await this.save();
  };

  // Instance method: reset failed attempts on successful login
  schema.methods.resetFailedAttempts = async function (): Promise<void> {
    this.set('failedLoginAttempts', 0);
    this.set('accountLockedUntil', null);
    await this.save();
  };

  // Ensure password is never returned in JSON unless explicitly selected
  schema.set('toJSON', {
    transform(_doc: unknown, ret: Record<string, unknown>) {
      delete ret.password;
      delete ret.refreshTokens;
      delete ret.mfaSecret;
      delete ret.mfaBackupCodes;
      delete ret.passwordResetToken;
      return ret;
    },
  });
}

export type { IAuthFields };
