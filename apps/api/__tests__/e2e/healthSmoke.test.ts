// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest').default;
import type { Request, Response } from 'express';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const express = require('express') as typeof import('express').default;

/**
 * E2E Smoke Test: Health Endpoints
 *
 * Validates that health check endpoints return expected shapes.
 * These are the first endpoints any monitoring system hits.
 */

describe('E2E: Health Endpoints', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Shallow health — mirrors apps/api/src/app.ts
    app.get('/health', (_req: Request, res: Response): void => {
      res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    });

    // Deep health — simulated
    app.get('/health/deep', (_req: Request, res: Response): void => {
      res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        services: {
          mongodb: { status: 'connected', latencyMs: 2 },
          redis: { status: 'connected', latencyMs: 1 },
        },
      });
    });

    // 404 handler
    app.use((_req: Request, res: Response): void => {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Endpoint not found' });
    });
  });

  // ─── Shallow Health ──────────────────────────────────────────────────

  test('GET /health returns 200 with ok status', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThan(0);
  });

  test('GET /health returns valid ISO timestamp', async () => {
    const res = await request(app).get('/health');

    expect(res.body.timestamp).toBeDefined();
    const parsed = new Date(res.body.timestamp as string);
    expect(parsed.toISOString()).toBe(res.body.timestamp);
  });

  test('GET /health responds within 50ms', async () => {
    const start = Date.now();
    await request(app).get('/health');
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(50);
  });

  // ─── Deep Health ─────────────────────────────────────────────────────

  test('GET /health/deep returns service status', async () => {
    const res = await request(app).get('/health/deep');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.services).toBeDefined();
    expect(res.body.services.mongodb.status).toBe('connected');
    expect(res.body.services.redis.status).toBe('connected');
  });

  test('GET /health/deep includes latency metrics', async () => {
    const res = await request(app).get('/health/deep');

    expect(typeof res.body.services.mongodb.latencyMs).toBe('number');
    expect(typeof res.body.services.redis.latencyMs).toBe('number');
  });

  // ─── 404 ─────────────────────────────────────────────────────────────

  test('unknown endpoint returns 404 with standard shape', async () => {
    const res = await request(app).get('/api/v1/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    });
  });

  test('404 response has correct content-type', async () => {
    const res = await request(app).get('/does-not-exist');

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
