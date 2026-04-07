import type { RequestHandler, Request } from 'express';
import type Redis from 'ioredis';

export interface RateLimiterConfig {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
}

export interface RateLimiterInit {
  redisClient?: Redis;
}

export interface AuthLimiters {
  otpSend: RequestHandler;
  otpVerify: RequestHandler;
  signin: RequestHandler;
  forgotPassword: RequestHandler;
  mfaVerify: RequestHandler;
}

export interface ApiLimiterConfig {
  windowMs?: number;
  max?: number;
}
