import { initPasswordService, hashPassword, comparePassword, validatePolicy } from '../src/services/passwordService';
import type { AuthConfig } from '../src/types';

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

describe('passwordService', () => {
  beforeAll(() => {
    initPasswordService(testConfig);
  });

  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const hash = await hashPassword('TestPass1');
      expect(hash).toBeDefined();
      expect(hash).not.toBe('TestPass1');
      expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);
    });

    it('should produce different hashes for the same password', async () => {
      const hash1 = await hashPassword('TestPass1');
      const hash2 = await hashPassword('TestPass1');
      expect(hash1).not.toBe(hash2); // Different salts
    });
  });

  describe('comparePassword', () => {
    it('should return true for matching password', async () => {
      const hash = await hashPassword('Correct1');
      const result = await comparePassword('Correct1', hash);
      expect(result).toBe(true);
    });

    it('should return false for wrong password', async () => {
      const hash = await hashPassword('Correct1');
      const result = await comparePassword('Wrong1', hash);
      expect(result).toBe(false);
    });
  });

  describe('validatePolicy (SEC-INV-07)', () => {
    it('should accept a valid password', () => {
      const errors = validatePolicy('ValidPass1');
      expect(errors).toHaveLength(0);
    });

    it('should reject password shorter than minLength', () => {
      const errors = validatePolicy('Sh1');
      expect(errors).toContainEqual(expect.stringContaining('at least 8'));
    });

    it('should reject password without uppercase when required', () => {
      const errors = validatePolicy('nouppercase1');
      expect(errors).toContainEqual(expect.stringContaining('uppercase'));
    });

    it('should reject password without lowercase when required', () => {
      const errors = validatePolicy('NOLOWERCASE1');
      expect(errors).toContainEqual(expect.stringContaining('lowercase'));
    });

    it('should reject password without number when required', () => {
      const errors = validatePolicy('NoNumberHere');
      expect(errors).toContainEqual(expect.stringContaining('number'));
    });

    it('should return multiple errors when multiple rules fail', () => {
      const errors = validatePolicy('ab');
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
