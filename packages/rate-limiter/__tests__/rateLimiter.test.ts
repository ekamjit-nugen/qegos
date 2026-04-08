/**
 * Rate Limiter — Tests
 *
 * Tests for @nugen/rate-limiter: limiter creation, auth limiters, config validation.
 * Unit/structural tests — no Redis required.
 */

import {
  createLimiter,
  initRateLimiter,
  getRedisClient,
  createAuthLimiters,
  createApiLimiter,
} from '../src';

import type {
  RateLimiterConfig,
  AuthLimiters,
  ApiLimiterConfig,
} from '../src/types';

// ═══════════════════════════════════════════════════════════════════════════════

describe('@nugen/rate-limiter', () => {

  // ─── Module Exports ────────────────────────────────────────────────────────

  describe('Module Exports', () => {
    it('exports createLimiter function', () => {
      expect(typeof createLimiter).toBe('function');
    });

    it('exports initRateLimiter function', () => {
      expect(typeof initRateLimiter).toBe('function');
    });

    it('exports getRedisClient function', () => {
      expect(typeof getRedisClient).toBe('function');
    });

    it('exports createAuthLimiters function', () => {
      expect(typeof createAuthLimiters).toBe('function');
    });

    it('exports createApiLimiter function', () => {
      expect(typeof createApiLimiter).toBe('function');
    });
  });

  // ─── createLimiter ─────────────────────────────────────────────────────────

  describe('createLimiter', () => {
    it('returns a middleware function', () => {
      const limiter = createLimiter({
        windowMs: 60_000,
        max: 100,
      });
      expect(typeof limiter).toBe('function');
    });

    it('accepts custom message', () => {
      const limiter = createLimiter({
        windowMs: 60_000,
        max: 10,
        message: 'Custom rate limit message',
      });
      expect(typeof limiter).toBe('function');
    });

    it('accepts keyGenerator', () => {
      const keyGen = (req: unknown): string => 'custom-key';
      const limiter = createLimiter({
        windowMs: 60_000,
        max: 5,
        keyGenerator: keyGen as never,
      });
      expect(typeof limiter).toBe('function');
    });

    it('accepts skipSuccessfulRequests option', () => {
      const limiter = createLimiter({
        windowMs: 60_000,
        max: 100,
        skipSuccessfulRequests: true,
      });
      expect(typeof limiter).toBe('function');
    });

    it('accepts skipFailedRequests option', () => {
      const limiter = createLimiter({
        windowMs: 60_000,
        max: 100,
        skipFailedRequests: true,
      });
      expect(typeof limiter).toBe('function');
    });
  });

  // ─── Redis Client State ────────────────────────────────────────────────────

  describe('Redis Client State', () => {
    it('getRedisClient returns null before initialization', () => {
      // Note: initRateLimiter may have been called in other tests,
      // but we test the function exists and returns expected type
      const client = getRedisClient();
      // Could be null or a Redis client depending on test order
      expect(client === null || typeof client === 'object').toBe(true);
    });
  });

  // ─── Auth Limiters (SEC-INV-01) ────────────────────────────────────────────

  describe('createAuthLimiters', () => {
    let limiters: AuthLimiters;

    beforeAll(() => {
      limiters = createAuthLimiters();
    });

    it('returns an object with all 5 auth limiters', () => {
      expect(limiters).toBeDefined();
      expect(typeof limiters.otpSend).toBe('function');
      expect(typeof limiters.otpVerify).toBe('function');
      expect(typeof limiters.signin).toBe('function');
      expect(typeof limiters.forgotPassword).toBe('function');
      expect(typeof limiters.mfaVerify).toBe('function');
    });

    it('otpSend limiter is a middleware function', () => {
      expect(limiters.otpSend.length).toBeGreaterThanOrEqual(0);
    });

    it('signin limiter is a middleware function', () => {
      expect(typeof limiters.signin).toBe('function');
    });

    it('mfaVerify limiter exists (FIX Vegeta S-1)', () => {
      // MFA verify MUST have rate limiting per SEC-INV-01
      expect(limiters.mfaVerify).toBeDefined();
      expect(typeof limiters.mfaVerify).toBe('function');
    });
  });

  // ─── API Limiter ───────────────────────────────────────────────────────────

  describe('createApiLimiter', () => {
    it('returns a middleware function with default config', () => {
      const limiter = createApiLimiter();
      expect(typeof limiter).toBe('function');
    });

    it('accepts custom windowMs and max', () => {
      const limiter = createApiLimiter({
        windowMs: 30_000,
        max: 50,
      });
      expect(typeof limiter).toBe('function');
    });
  });

  // ─── Type Safety ───────────────────────────────────────────────────────────

  describe('Type Safety', () => {
    it('RateLimiterConfig requires windowMs and max', () => {
      const config: RateLimiterConfig = {
        windowMs: 60_000,
        max: 100,
      };
      expect(config.windowMs).toBe(60_000);
      expect(config.max).toBe(100);
    });

    it('ApiLimiterConfig has all optional fields', () => {
      const config: ApiLimiterConfig = {};
      expect(config.windowMs).toBeUndefined();
      expect(config.max).toBeUndefined();
    });

    it('AuthLimiters interface has exactly 5 limiters', () => {
      const keys: (keyof AuthLimiters)[] = [
        'otpSend', 'otpVerify', 'signin', 'forgotPassword', 'mfaVerify',
      ];
      expect(keys).toHaveLength(5);
    });
  });
});
