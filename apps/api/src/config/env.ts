import { z } from 'zod';

/**
 * Typed environment config with Zod validation.
 * Fails fast on startup if required variables are missing.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  API_VERSION: z.string().default('v1'),

  // MongoDB
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  // Redis
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // Encryption
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters'),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),

  // CSRF
  CSRF_SECRET: z.string().min(32).optional(),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // Logging
  LOG_LEVEL: z.string().default('debug'),

  // MFA
  MFA_ISSUER: z.string().default('QEGOS'),

  // Twilio (optional in dev)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),

  // Payment Gateway (Phase 1)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  PAYZOO_API_KEY: z.string().optional(),
  PAYZOO_API_SECRET: z.string().optional(),
  PAYZOO_BASE_URL: z.string().optional(),
  PAYZOO_PUBLIC_KEY: z.string().optional(),
  PAYZOO_WEBHOOK_SECRET: z.string().optional(),
}).refine(
  // Fix for S-3.18: Ensure at least one payment gateway is configured
  (data) => {
    if (data.NODE_ENV === 'test') return true; // Skip in test
    const hasStripe = Boolean(data.STRIPE_SECRET_KEY);
    const hasPayzoo = Boolean(data.PAYZOO_API_KEY && data.PAYZOO_API_SECRET);
    return hasStripe || hasPayzoo;
  },
  {
    message: 'At least one payment gateway must be configured (STRIPE_SECRET_KEY or PAYZOO_API_KEY+PAYZOO_API_SECRET)',
  },
);

export type EnvConfig = z.infer<typeof envSchema>;

let _config: EnvConfig | null = null;

export function loadConfig(): EnvConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${errors}`);
  }
  _config = result.data;
  return _config;
}

export function getConfig(): EnvConfig {
  if (!_config) {
    return loadConfig();
  }
  return _config;
}
