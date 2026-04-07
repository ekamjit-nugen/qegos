import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { globalErrorHandler } from '@nugen/error-handler';
import { sanitize } from '@nugen/validator';
import { createApiLimiter } from '@nugen/rate-limiter';
import { getConfig } from './config/env';

/**
 * Create and configure the Express application.
 * All Tier 1 packages are wired here.
 * Routes are mounted after database connection in server.ts.
 */
export function createApp(): express.Express {
  const app = express();
  const config = getConfig();

  // --- Security middleware ---

  // Helmet.js (SEC-INV-10)
  app.use(
    helmet({
      contentSecurityPolicy: config.NODE_ENV === 'production' ? undefined : false,
      hsts: { maxAge: 31536000, includeSubDomains: true },
      frameguard: { action: 'deny' },
    }),
  );

  // CORS whitelist (SEC-INV-11)
  const corsOrigins = config.CORS_ORIGINS.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Device-Id'],
    }),
  );

  // Fix for T-3.4: Stripe raw body parser BEFORE global JSON parser
  // Stripe webhook signature verification requires the raw body.
  const config2 = getConfig();
  app.use(
    `/api/${config2.API_VERSION}/payments/webhooks/stripe`,
    express.raw({ type: 'application/json' }),
  );

  // --- Parsing ---
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // --- Compression ---
  app.use(compression());

  // --- Sanitization (GAP-C14) ---
  app.use(sanitize());

  // --- Rate limiting (NFR-03: 100/min per user) ---
  app.use(`/api/${config.API_VERSION}`, createApiLimiter());

  // Fix for S-3.6: CSRF protection for state-changing routes
  // Skip CSRF on webhook endpoints (they use signature verification)
  if (config.CSRF_SECRET) {
    const webhookPaths = ['/payments/webhooks/'];
    app.use(`/api/${config.API_VERSION}`, (req: Request, res: Response, next: express.NextFunction): void => {
      // Skip CSRF for webhooks and safe HTTP methods
      if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
        next();
        return;
      }
      // Skip CSRF for webhook paths
      if (webhookPaths.some((p) => req.path.includes(p))) {
        next();
        return;
      }
      // Validate CSRF token from header or body
      const csrfToken = (req.headers['x-csrf-token'] as string | undefined)
        ?? (req.body as Record<string, unknown> | undefined)?._csrf as string | undefined;
      if (!csrfToken || csrfToken !== (req.cookies as Record<string, string>)?._csrf) {
        res.status(403).json({
          status: 403,
          code: 'CSRF_INVALID',
          message: 'Invalid or missing CSRF token',
        });
        return;
      }
      next();
    });
  }

  // CSRF token generation endpoint
  app.get(`/api/${config.API_VERSION}/csrf-token`, (_req: Request, res: Response): void => {
    const csrfConfig = getConfig();
    if (!csrfConfig.CSRF_SECRET) {
      res.status(200).json({ status: 200, data: { csrfEnabled: false } });
      return;
    }
    const token = require('crypto').randomBytes(32).toString('hex');
    res.cookie('_csrf', token, {
      httpOnly: true,
      secure: csrfConfig.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    res.status(200).json({ status: 200, data: { csrfToken: token } });
  });

  // --- Health check endpoints ---

  // Shallow health (public)
  app.get('/health', (_req: Request, res: Response): void => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}

/**
 * Mount routes and finalize app setup.
 * Called after all models and packages are initialized.
 */
export function finalizeApp(
  app: express.Express,
  routes: {
    authRouter: express.Router;
    rbacRouter: express.Router;
    auditRouter: express.Router;
    userRouter: express.Router;
    taxRuleRouter: express.Router;
    paymentRouter?: express.Router;
    billingDisputeRouter?: express.Router;
    // Phase 3: Lead & Order Core + Review Pipeline
    leadRouter?: express.Router;
    orderRouter?: express.Router;
    salesRouter?: express.Router;
    reviewRouter?: express.Router;
    // Phase 4: Tax Engine
    taxEngineRouter?: express.Router;
    // Phase 5: Broadcast Engine
    broadcastRouter?: express.Router;
  },
  deepHealthCheck: (req: Request, res: Response) => Promise<void>,
): void {
  const config = getConfig();
  const prefix = `/api/${config.API_VERSION}`;

  // Deep health check (unauthenticated but could be IP-restricted)
  // FIX for Vegeta B-21: No authentication required for monitoring
  app.get('/health/deep', (req: Request, res: Response) => {
    void deepHealthCheck(req, res);
  });

  // NOTE: Stripe raw body parser moved to createApp() BEFORE express.json() — Fix T-3.4

  // Mount routes
  app.use(`${prefix}/auth`, routes.authRouter);
  app.use(`${prefix}`, routes.rbacRouter);
  app.use(`${prefix}/audit-logs`, routes.auditRouter);
  app.use(`${prefix}/users`, routes.userRouter);
  app.use(`${prefix}/tax-rules`, routes.taxRuleRouter);

  // Phase 1: Payment & Billing routes
  if (routes.paymentRouter) {
    app.use(`${prefix}/payments`, routes.paymentRouter);
  }
  if (routes.billingDisputeRouter) {
    app.use(`${prefix}/billing-disputes`, routes.billingDisputeRouter);
  }

  // Phase 3: Lead & Order Core + Review Pipeline
  if (routes.leadRouter) {
    app.use(`${prefix}/leads`, routes.leadRouter);
  }
  if (routes.orderRouter) {
    app.use(`${prefix}/orders`, routes.orderRouter);
  }
  if (routes.salesRouter) {
    app.use(`${prefix}/sales`, routes.salesRouter);
  }
  if (routes.reviewRouter) {
    app.use(`${prefix}/order-reviews`, routes.reviewRouter);
  }

  // Phase 4: Tax Engine
  if (routes.taxEngineRouter) {
    app.use(`${prefix}/tax-engine`, routes.taxEngineRouter);
  }

  // Phase 5: Broadcast Engine
  if (routes.broadcastRouter) {
    app.use(`${prefix}/broadcasts`, routes.broadcastRouter);
  }

  // 404 handler
  app.use((_req: Request, res: Response): void => {
    res.status(404).json({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    });
  });

  // Global error handler (must be last)
  app.use(globalErrorHandler);
}
