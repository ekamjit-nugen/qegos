import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import type {
  AuthConfig,
  TokenPayload,
  RefreshTokenPayload,
  TokenPair,
  RefreshTokenEntry,
  IAuthDocument,
  MfaChallengeToken,
} from '../types';

let _config: AuthConfig | null = null;

export function initJwtService(config: AuthConfig): void {
  _config = config;
}

function getConfig(): AuthConfig {
  if (!_config) {
    throw new Error('JWT service not initialized. Call initJwtService(config) first.');
  }
  return _config;
}

export function generateAccessToken(payload: TokenPayload): string {
  const config = getConfig();
  return jwt.sign(
    { userId: payload.userId, userType: payload.userType, roleId: payload.roleId },
    config.jwtAccessSecret,
    { expiresIn: config.jwtAccessExpiry } as jwt.SignOptions,
  );
}

export function generateRefreshToken(payload: RefreshTokenPayload): string {
  const config = getConfig();
  return jwt.sign(
    { userId: payload.userId, deviceId: payload.deviceId, tokenVersion: payload.tokenVersion },
    config.jwtRefreshSecret,
    { expiresIn: config.jwtRefreshExpiry } as jwt.SignOptions,
  );
}

export function verifyAccessToken(token: string): TokenPayload {
  const config = getConfig();
  return jwt.verify(token, config.jwtAccessSecret) as TokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const config = getConfig();
  return jwt.verify(token, config.jwtRefreshSecret) as RefreshTokenPayload;
}

/**
 * Generate an MFA challenge token — a time-limited token issued after
 * successful password auth, used to authorize the MFA verify step.
 * FIX for Vegeta S-1: Never accept raw userId for MFA verification.
 */
export function generateMfaChallengeToken(userId: string): string {
  const config = getConfig();
  const challengeId = crypto.randomBytes(16).toString('hex');
  return jwt.sign(
    { userId, challengeId, type: 'mfa_challenge' } as MfaChallengeToken & { type: string },
    config.jwtAccessSecret,
    { expiresIn: '5m' }, // 5-minute window to complete MFA
  );
}

export function verifyMfaChallengeToken(token: string): MfaChallengeToken {
  const config = getConfig();
  const decoded = jwt.verify(token, config.jwtAccessSecret) as MfaChallengeToken & { type: string };
  if (decoded.type !== 'mfa_challenge') {
    throw new Error('Invalid MFA challenge token');
  }
  return decoded;
}

/**
 * Issue a new token pair and store the hashed refresh token on the user.
 * Enforces max sessions (SEC-INV-06): if at limit, removes the oldest.
 */
export async function issueTokenPair(
  user: IAuthDocument,
  deviceId: string,
  userAgent: string,
  ipAddress: string,
): Promise<TokenPair> {
  const config = getConfig();

  const accessToken = generateAccessToken({
    userId: user._id.toString(),
    userType: user.userType,
    roleId: user.roleId.toString(),
  });

  const refreshToken = generateRefreshToken({
    userId: user._id.toString(),
    deviceId,
    tokenVersion: Date.now(),
  });

  // Hash refresh token before storage (SEC-INV-03)
  const hashedRefresh = await bcrypt.hash(refreshToken, config.bcryptRounds);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  const newEntry: RefreshTokenEntry = {
    token: hashedRefresh,
    deviceId,
    userAgent,
    ipAddress,
    createdAt: new Date(),
    expiresAt,
  };

  // Remove expired tokens first
  user.refreshTokens = user.refreshTokens.filter((t) => t.expiresAt > new Date());

  // Enforce max sessions (SEC-INV-06)
  if (user.refreshTokens.length >= config.maxSessions) {
    // Remove the oldest session
    user.refreshTokens.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    user.refreshTokens.shift();
  }

  // Check if same device already has a session — replace it
  const existingIdx = user.refreshTokens.findIndex((t) => t.deviceId === deviceId);
  if (existingIdx !== -1) {
    user.refreshTokens.splice(existingIdx, 1);
  }

  user.refreshTokens.push(newEntry);

  // Use atomic updateOne to avoid Mongoose VersionError on concurrent refreshes.
  // user.save() uses optimistic concurrency (__v check) which fails when two
  // refresh requests race on the same document.
  await user.updateOne({ $set: { refreshTokens: user.refreshTokens } });

  return { accessToken, refreshToken };
}

/**
 * Rotate refresh token. If the old token matches, issue new pair.
 * If old token does NOT match any stored hash, this is a replay attack —
 * revoke ALL tokens for the user (SEC-INV-04).
 */
export async function rotateRefreshToken(
  user: IAuthDocument,
  oldToken: string,
  deviceId: string,
  userAgent: string,
  ipAddress: string,
): Promise<TokenPair | null> {
  // Find the matching token entry
  let matchedIndex = -1;
  for (let i = 0; i < user.refreshTokens.length; i++) {
    const isMatch = await bcrypt.compare(oldToken, user.refreshTokens[i].token);
    if (isMatch) {
      matchedIndex = i;
      break;
    }
  }

  if (matchedIndex === -1) {
    // Replay attack detected — revoke ALL tokens (SEC-INV-04)
    user.refreshTokens = [];
    await user.updateOne({ $set: { refreshTokens: [] } });
    return null;
  }

  // Remove the old token entry
  user.refreshTokens.splice(matchedIndex, 1);

  // Issue new pair
  return issueTokenPair(user, deviceId, userAgent, ipAddress);
}

/**
 * Revoke a specific device's refresh token.
 */
export async function revokeToken(user: IAuthDocument, deviceId: string): Promise<void> {
  user.refreshTokens = user.refreshTokens.filter((t) => t.deviceId !== deviceId);
  await user.updateOne({ $set: { refreshTokens: user.refreshTokens } });
}

/**
 * Revoke ALL refresh tokens for a user — force logout all devices.
 */
export async function revokeAllTokens(user: IAuthDocument): Promise<void> {
  user.refreshTokens = [];
  await user.updateOne({ $set: { refreshTokens: [] } });
}
