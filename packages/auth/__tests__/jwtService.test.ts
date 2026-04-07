import { initJwtService, generateAccessToken, verifyAccessToken, generateMfaChallengeToken, verifyMfaChallengeToken } from '../src/services/jwtService';
import type { AuthConfig, TokenPayload } from '../src/types';

const testConfig: AuthConfig = {
  jwtAccessSecret: 'test-access-secret-that-is-at-least-32-chars-long',
  jwtRefreshSecret: 'test-refresh-secret-that-is-at-least-32-chars-long',
  jwtAccessExpiry: '15m',
  jwtRefreshExpiry: '7d',
  maxSessions: 5,
  otpExpiry: 300,
  otpLength: 6,
  bcryptRounds: 4, // Low rounds for test speed
  passwordPolicy: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecial: false,
  },
  phoneRegex: /^\+61\d{9}$/,
  mfaIssuer: 'TestApp',
};

describe('jwtService', () => {
  beforeAll(() => {
    initJwtService(testConfig);
  });

  describe('access tokens', () => {
    it('should generate a valid access token', () => {
      const payload: TokenPayload = {
        userId: '507f1f77bcf86cd799439011',
        userType: 1,
        roleId: '507f1f77bcf86cd799439012',
      };
      const token = generateAccessToken(payload);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format
    });

    it('should verify and decode access token correctly', () => {
      const payload: TokenPayload = {
        userId: '507f1f77bcf86cd799439011',
        userType: 2,
        roleId: '507f1f77bcf86cd799439012',
      };
      const token = generateAccessToken(payload);
      const decoded = verifyAccessToken(token);

      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.userType).toBe(payload.userType);
      expect(decoded.roleId).toBe(payload.roleId);
    });

    it('should reject tampered tokens', () => {
      const token = generateAccessToken({
        userId: '507f1f77bcf86cd799439011',
        userType: 1,
        roleId: '507f1f77bcf86cd799439012',
      });
      const tampered = token + 'xyz';
      expect(() => verifyAccessToken(tampered)).toThrow();
    });

    it('should include iat and exp in decoded token', () => {
      const token = generateAccessToken({
        userId: '507f1f77bcf86cd799439011',
        userType: 1,
        roleId: '507f1f77bcf86cd799439012',
      });
      const decoded = verifyAccessToken(token);
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
      expect(typeof decoded.iat).toBe('number');
    });
  });

  describe('MFA challenge tokens (FIX S-1)', () => {
    it('should generate a challenge token for MFA flow', () => {
      const token = generateMfaChallengeToken('507f1f77bcf86cd799439011');
      expect(typeof token).toBe('string');
    });

    it('should verify and return userId from challenge token', () => {
      const userId = '507f1f77bcf86cd799439011';
      const token = generateMfaChallengeToken(userId);
      const decoded = verifyMfaChallengeToken(token);
      expect(decoded.userId).toBe(userId);
      expect(decoded.challengeId).toBeDefined();
    });

    it('should reject a regular access token as MFA challenge', () => {
      const accessToken = generateAccessToken({
        userId: '507f1f77bcf86cd799439011',
        userType: 1,
        roleId: '507f1f77bcf86cd799439012',
      });
      expect(() => verifyMfaChallengeToken(accessToken)).toThrow();
    });
  });
});
