import type { Request, RequestHandler } from 'express';
import { createLimiter } from './createLimiter';
import type { AuthLimiters } from './types';

/**
 * Pre-built rate limiters matching SEC-INV-01:
 * - OTP send: 3/mobile/15min
 * - OTP verify: 5/OTP
 * - Signin: 5/email/15min
 * - Forgot-password: 3/email/hour
 * - MFA verify: 5/userId/15min (FIX for Vegeta S-1: was missing)
 */
export function createAuthLimiters(): AuthLimiters {
  const otpSend: RequestHandler = createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3,
    message: 'Too many OTP requests. Please try again in 15 minutes.',
    keyGenerator: (req: Request): string => {
      const mobile = (req.body as Record<string, unknown>)?.mobile;
      return `otp-send:${typeof mobile === 'string' ? mobile : req.ip}`;
    },
  });

  const otpVerify: RequestHandler = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many OTP verification attempts. Please request a new OTP.',
    keyGenerator: (req: Request): string => {
      const mobile = (req.body as Record<string, unknown>)?.mobile;
      return `otp-verify:${typeof mobile === 'string' ? mobile : req.ip}`;
    },
  });

  const signin: RequestHandler = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many sign-in attempts. Please try again in 15 minutes.',
    keyGenerator: (req: Request): string => {
      const email = (req.body as Record<string, unknown>)?.email;
      return `signin:${typeof email === 'string' ? email : req.ip}`;
    },
  });

  const forgotPassword: RequestHandler = createLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    message: 'Too many password reset requests. Please try again in 1 hour.',
    keyGenerator: (req: Request): string => {
      const email = (req.body as Record<string, unknown>)?.email;
      return `forgot-pwd:${typeof email === 'string' ? email : req.ip}`;
    },
  });

  // FIX for Vegeta S-1: MFA verify MUST have rate limiting
  const mfaVerify: RequestHandler = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many MFA verification attempts. Please try again in 15 minutes.',
    keyGenerator: (req: Request): string => {
      const userId = (req.body as Record<string, unknown>)?.userId;
      // Also use IP as fallback to prevent abuse
      return `mfa-verify:${typeof userId === 'string' ? userId : req.ip}`;
    },
  });

  return { otpSend, otpVerify, signin, forgotPassword, mfaVerify };
}
