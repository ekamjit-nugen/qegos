import type { Document, Types } from 'mongoose';
import type { Request } from 'express';

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
}

export interface AuthConfig {
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessExpiry: string;
  jwtRefreshExpiry: string;
  maxSessions: number;
  otpExpiry: number;
  otpLength: number;
  bcryptRounds: number;
  passwordPolicy: PasswordPolicy;
  phoneRegex: RegExp;
  mfaIssuer: string;
  /** Fix for S-3.15: Max OTP verification attempts before lockout (default: 5) */
  otpMaxAttempts?: number;
  /** Fix for S-3.20: Max failed login attempts before account lockout (default: 10) */
  maxFailedLoginAttempts?: number;
  /** Fix for S-3.20: Lockout duration in ms (default: 1800000 = 30 min) */
  lockoutDurationMs?: number;
  /** Fix for S-3.20: Number of MFA backup codes to generate (default: 10) */
  mfaBackupCodeCount?: number;
  sendOtp?: (mobile: string, otp: string) => Promise<void>;
  sendPasswordResetEmail?: (email: string, token: string) => Promise<void>;
}

export interface TokenPayload {
  userId: string;
  userType: number;
  roleId: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  userId: string;
  deviceId: string;
  tokenVersion: number;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenEntry {
  token: string; // bcrypt hashed
  deviceId: string;
  userAgent: string;
  ipAddress: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface IAuthFields {
  password?: string;
  refreshTokens: RefreshTokenEntry[];
  failedLoginAttempts: number;
  accountLockedUntil: Date | null;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  passwordChangedAt: Date | null;
  mfaEnabled: boolean;
  mfaSecret: string | null;
  mfaBackupCodes: string[]; // Stored as bcrypt hashes (FIX S-3)
  passwordResetToken: string | null;
  passwordResetExpires: Date | null;
}

export interface IAuthDocument extends IAuthFields, Document {
  _id: Types.ObjectId;
  email?: string;
  mobile?: string;
  userType: number;
  roleId: Types.ObjectId;
  status: boolean;
  isDeleted: boolean;
  isCorrectPassword(password: string): Promise<boolean>;
  isAccountLocked(): boolean;
  incrementFailedAttempts(): Promise<void>;
  resetFailedAttempts(): Promise<void>;
}

export interface IOtp {
  mobile: string;
  otpHash: string; // FIX S-2: stored as hash, not plaintext
  expiresAt: Date;
  isUsed: boolean;
  attempts: number;
  createdAt: Date;
}

export interface IOtpDocument extends IOtp, Document {
  _id: Types.ObjectId;
}

export interface MfaEnrollmentResult {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[]; // Plaintext — returned once, stored as hashes
}

export interface AuthenticatedRequest extends Request {
  user: TokenPayload;
  scopeFilter?: Record<string, unknown>;
}

export interface MfaChallengeToken {
  userId: string;
  challengeId: string;
  expiresAt: number;
}
