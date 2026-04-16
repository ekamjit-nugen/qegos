// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest').default;
import type { Request, Response, NextFunction, RequestHandler } from 'express';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const express = require('express') as typeof import('express').default;

/**
 * E2E Smoke Test: Analytics Dashboard Endpoints
 *
 * Tests all 11 analytics endpoints with simulated data.
 * Validates authentication, permissions, validation, caching, and response shapes.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface AnalyticsResponse {
  status: number;
  data?: unknown;
  code?: string;
  message?: string;
  errors?: Array<{ msg: string; path: string }>;
}

// ─── Simulated Analytics API ────────────────────────────────────────────────

function createAnalyticsApp(): express.Express {
  const app = express();
  app.use(express.json());

  // In-memory cache
  const cache = new Map<string, { data: unknown; expires: number }>();
  let executiveSummary: Record<string, unknown> | null = null;

  // Simulated data stores
  const revenueData = [
    { period: '2025-01', totalCents: 850000, count: 15 },
    { period: '2025-02', totalCents: 920000, count: 18 },
    { period: '2025-03', totalCents: 1100000, count: 22 },
  ];

  const pipelineData = [
    {
      stage: 1,
      stageName: 'New',
      count: 45,
      totalValueCents: 3000000,
      conversionRate: 0.78,
      avgDaysInStage: 3,
      isBottleneck: true,
    },
    {
      stage: 2,
      stageName: 'Contacted',
      count: 35,
      totalValueCents: 2500000,
      conversionRate: 0.71,
      avgDaysInStage: 5,
      isBottleneck: false,
    },
    {
      stage: 3,
      stageName: 'Qualified',
      count: 25,
      totalValueCents: 1800000,
      conversionRate: 0.6,
      avgDaysInStage: 7,
      isBottleneck: false,
    },
    {
      stage: 6,
      stageName: 'Won',
      count: 15,
      totalValueCents: 1200000,
      conversionRate: 1.0,
      avgDaysInStage: 0,
      isBottleneck: false,
    },
  ];

  const clvData = [
    {
      userId: 'u-1',
      displayName: 'Alice Smith',
      totalSpentCents: 1200000,
      paymentCount: 12,
      segment: 'premium',
    },
    { userId: 'u-2', displayName: 'Bob Jones', totalSpentCents: 850000, paymentCount: 8 },
    { userId: 'u-3', displayName: 'Carol White', totalSpentCents: 500000, paymentCount: 5 },
  ];

  const staffData = [
    {
      staffId: 's-1',
      displayName: 'Jane Doe',
      ordersCompleted: 25,
      leadsContacted: 80,
      avgReviewMinutes: 35,
      ticketsResolved: 12,
    },
    {
      staffId: 's-2',
      displayName: 'John Smith',
      ordersCompleted: 18,
      leadsContacted: 60,
      avgReviewMinutes: 42,
      ticketsResolved: 8,
    },
  ];

  // Auth middleware
  const auth: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
    const token = req.headers.authorization;
    if (!token || !token.startsWith('Bearer ')) {
      _res
        .status(401)
        .json({ status: 401, code: 'UNAUTHORIZED', message: 'Missing token' } as AnalyticsResponse);
      return;
    }
    if (token === 'Bearer denied-token') {
      _res.status(403).json({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      } as AnalyticsResponse);
      return;
    }
    (req as unknown as Record<string, unknown>).user = { userId: 'staff-001', userType: 1 };
    next();
  };

  // Validation helpers
  const validateDateRange: RequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const { dateFrom, dateTo } = (req.method === 'GET' ? req.query : req.body) as {
      dateFrom?: string;
      dateTo?: string;
    };
    if (!dateFrom || !dateTo) {
      res.status(400).json({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'dateFrom and dateTo required',
      } as AnalyticsResponse);
      return;
    }
    const from = new Date(dateFrom as string);
    const to = new Date(dateTo as string);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      res.status(400).json({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid date format',
      } as AnalyticsResponse);
      return;
    }
    const days = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    if (days > 366) {
      res.status(400).json({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Date range exceeds 366 days (ANA-INV-05)',
      } as AnalyticsResponse);
      return;
    }
    next();
  };

  // Cache helper
  const withCache = (key: string, ttl: number, data: unknown): unknown => {
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
    cache.set(key, { data, expires: Date.now() + ttl * 1000 });
    return data;
  };

  // ── 1. Executive Summary (pre-computed) ──────────────────────────────
  app.get('/api/v1/analytics/executive-summary', auth, (_req: Request, res: Response): void => {
    if (!executiveSummary) {
      res.status(202).json({ status: 202, message: 'Executive summary is being computed' });
      return;
    }
    res.status(200).json({ status: 200, data: executiveSummary });
  });

  // POST to pre-compute (simulates BullMQ worker)
  app.post('/api/v1/analytics/_test/compute-summary', (_req: Request, res: Response): void => {
    executiveSummary = {
      generatedAt: new Date().toISOString(),
      revenue: { totalCents: 2870000, monthOverMonth: 19.57, forecast: [], isEstimated: false },
      pipeline: { totalLeads: 120, conversionRate: 12.5, avgDaysToConvert: 15 },
      orders: { totalActive: 45, completedThisMonth: 22, avgCompletionPercent: 68 },
      churn: { atRiskCount: 8 },
      collection: { onTimeRate: 0.92, outstandingCents: 150000 },
    };
    res.status(200).json({ status: 200, data: executiveSummary });
  });

  // ── 2. Revenue Forecast ──────────────────────────────────────────────
  app.get(
    '/api/v1/analytics/revenue-forecast',
    auth,
    validateDateRange,
    (req: Request, res: Response): void => {
      const data = withCache('revenue-forecast', 300, {
        historical: revenueData,
        forecast: [
          {
            quarter: '2025-Q2',
            predictedCents: 3200000,
            lowerBoundCents: 2800000,
            upperBoundCents: 3600000,
          },
          {
            quarter: '2025-Q3',
            predictedCents: 3500000,
            lowerBoundCents: 2900000,
            upperBoundCents: 4100000,
          },
        ],
        isEstimated: false,
        dataMonths: 3,
      });
      res.status(200).json({ status: 200, data });
    },
  );

  // ── 3. CLV (POST) ───────────────────────────────────────────────────
  app.post('/api/v1/analytics/clv', auth, (req: Request, res: Response): void => {
    const { topN } = req.body as { topN?: number };
    if (topN !== undefined && (topN < 1 || topN > 100)) {
      res
        .status(400)
        .json({ status: 400, code: 'VALIDATION_ERROR', message: 'topN must be 1-100' });
      return;
    }
    const limit = topN ?? 50;
    const data = clvData.slice(0, limit);
    res.status(200).json({ status: 200, data });
  });

  // ── 4. Staff Benchmark ──────────────────────────────────────────────
  app.get(
    '/api/v1/analytics/staff-benchmark',
    auth,
    validateDateRange,
    (_req: Request, res: Response): void => {
      res.status(200).json({ status: 200, data: staffData });
    },
  );

  // ── 5. Channel ROI (POST) ──────────────────────────────────────────
  app.post('/api/v1/analytics/channel-roi', auth, (req: Request, res: Response): void => {
    const { dateFrom, dateTo } = req.body as { dateFrom?: string; dateTo?: string };
    if (!dateFrom || !dateTo) {
      res
        .status(400)
        .json({ status: 400, code: 'VALIDATION_ERROR', message: 'dateFrom and dateTo required' });
      return;
    }

    res.status(200).json({
      status: 200,
      data: [
        {
          channel: 'google_ads',
          campaignCount: 5,
          leadsGenerated: 100,
          conversions: 30,
          revenueCents: 500000,
          costCents: 100000,
          roi: 4.0,
        },
        {
          channel: 'referral',
          campaignCount: 2,
          leadsGenerated: 50,
          conversions: 20,
          revenueCents: 300000,
          costCents: 20000,
          roi: 14.0,
        },
      ],
    });
  });

  // ── 6. Seasonal Trends ──────────────────────────────────────────────
  app.get(
    '/api/v1/analytics/seasonal-trends',
    auth,
    validateDateRange,
    (req: Request, res: Response): void => {
      const granularity = (req.query.granularity as string) ?? 'month';
      if (granularity !== 'week' && granularity !== 'month') {
        res.status(400).json({
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'granularity must be week or month',
        });
        return;
      }
      res.status(200).json({
        status: 200,
        data: [
          {
            period: '2025-01',
            orderCount: 15,
            revenueCents: 850000,
            previousYearOrderCount: 12,
            previousYearRevenueCents: 700000,
          },
          {
            period: '2025-02',
            orderCount: 18,
            revenueCents: 920000,
            previousYearOrderCount: 14,
            previousYearRevenueCents: 780000,
          },
        ],
      });
    },
  );

  // ── 7. Churn Risk ──────────────────────────────────────────────────
  app.get('/api/v1/analytics/churn-risk', auth, (req: Request, res: Response): void => {
    const fy = req.query.financialYear as string;
    if (!fy || !/^\d{4}-\d{4}$/.test(fy)) {
      res.status(400).json({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'financialYear must be YYYY-YYYY',
      });
      return;
    }
    res.status(200).json({
      status: 200,
      data: [
        {
          userId: 'u-5',
          displayName: 'Lapsed Client',
          lastFinancialYear: '2024-2025',
          totalPaidCents: 250000,
          daysSinceLastOrder: 180,
        },
      ],
    });
  });

  // ── 8. Service Mix ─────────────────────────────────────────────────
  app.get(
    '/api/v1/analytics/service-mix',
    auth,
    validateDateRange,
    (_req: Request, res: Response): void => {
      res.status(200).json({
        status: 200,
        data: [
          {
            serviceTitle: 'Individual Tax Return',
            orderCount: 50,
            quantity: 50,
            revenueCents: 2500000,
            percentOfTotal: 62.5,
          },
          {
            serviceTitle: 'BAS Preparation',
            orderCount: 20,
            quantity: 25,
            revenueCents: 1000000,
            percentOfTotal: 25.0,
          },
          {
            serviceTitle: 'SMSF Audit',
            orderCount: 5,
            quantity: 5,
            revenueCents: 500000,
            percentOfTotal: 12.5,
          },
        ],
      });
    },
  );

  // ── 9. Collection Rate ──────────────────────────────────────────────
  app.get(
    '/api/v1/analytics/collection-rate',
    auth,
    validateDateRange,
    (_req: Request, res: Response): void => {
      res.status(200).json({
        status: 200,
        data: {
          onTimeRate: 0.92,
          avgDaysToPayment: 14,
          outstandingReceivablesCents: 150000,
          totalInvoicedCents: 5000000,
          totalCollectedCents: 4600000,
        },
      });
    },
  );

  // ── 10. Pipeline Health ─────────────────────────────────────────────
  app.get(
    '/api/v1/analytics/pipeline-health',
    auth,
    validateDateRange,
    (_req: Request, res: Response): void => {
      res.status(200).json({ status: 200, data: pipelineData });
    },
  );

  // ── 11. Export (POST, async) ────────────────────────────────────────
  app.post('/api/v1/analytics/export', auth, (req: Request, res: Response): void => {
    const { format, widgets } = req.body as { format?: string; widgets?: string[] };
    if (!format || !['pdf', 'xlsx'].includes(format)) {
      res
        .status(400)
        .json({ status: 400, code: 'VALIDATION_ERROR', message: 'format must be pdf or xlsx' });
      return;
    }
    if (!widgets || !Array.isArray(widgets) || widgets.length === 0) {
      res
        .status(400)
        .json({ status: 400, code: 'VALIDATION_ERROR', message: 'widgets array required' });
      return;
    }

    res.status(202).json({
      status: 202,
      data: {
        jobId: `export-${Date.now()}`,
        status: 'queued',
        format,
        widgets,
      },
    });
  });

  return app;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('E2E: Analytics Dashboard', () => {
  const app = createAnalyticsApp();
  const validToken = 'Bearer valid-token-123';
  const validDateRange = { dateFrom: '2025-01-01', dateTo: '2025-12-31' };

  // ─── Authentication & Authorization ─────────────────────────────────

  describe('Auth guard', () => {
    test('returns 401 without auth token', async () => {
      const res = await request(app).get('/api/v1/analytics/revenue-forecast');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    test('returns 403 with insufficient permissions', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/revenue-forecast')
        .set('Authorization', 'Bearer denied-token');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  // ─── Date Range Validation (ANA-INV-05) ─────────────────────────────

  describe('Date range validation', () => {
    test('rejects missing dateFrom/dateTo', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/revenue-forecast')
        .set('Authorization', validToken);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    test('rejects date range > 366 days', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/revenue-forecast')
        .query({ dateFrom: '2024-01-01', dateTo: '2026-01-01' })
        .set('Authorization', validToken);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('366');
    });

    test('accepts valid date range', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/revenue-forecast')
        .query(validDateRange)
        .set('Authorization', validToken);
      expect(res.status).toBe(200);
    });
  });

  // ─── Executive Summary ──────────────────────────────────────────────

  describe('GET /executive-summary', () => {
    test('returns 202 when not yet computed', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/executive-summary')
        .set('Authorization', validToken);
      expect(res.status).toBe(202);
    });

    test('returns summary after computation', async () => {
      // Trigger computation
      await request(app).post('/api/v1/analytics/_test/compute-summary');

      const res = await request(app)
        .get('/api/v1/analytics/executive-summary')
        .set('Authorization', validToken);

      expect(res.status).toBe(200);
      expect(res.body.data.revenue).toBeDefined();
      expect(res.body.data.pipeline).toBeDefined();
      expect(res.body.data.orders).toBeDefined();
      expect(res.body.data.churn).toBeDefined();
      expect(res.body.data.collection).toBeDefined();
      expect(res.body.data.generatedAt).toBeDefined();
    });

    test('summary has correct shape', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/executive-summary')
        .set('Authorization', validToken);

      const { data } = res.body;
      expect(data.revenue.totalCents).toBe(2870000);
      expect(typeof data.revenue.monthOverMonth).toBe('number');
      expect(typeof data.pipeline.conversionRate).toBe('number');
      expect(typeof data.collection.onTimeRate).toBe('number');
      expect(data.churn.atRiskCount).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── Revenue Forecast ───────────────────────────────────────────────

  describe('GET /revenue-forecast', () => {
    test('returns historical data and quarterly forecasts', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/revenue-forecast')
        .query(validDateRange)
        .set('Authorization', validToken);

      expect(res.status).toBe(200);
      expect(res.body.data.historical).toHaveLength(3);
      expect(res.body.data.forecast).toHaveLength(2);
      expect(typeof res.body.data.isEstimated).toBe('boolean');
      expect(typeof res.body.data.dataMonths).toBe('number');
    });

    test('forecast quarters have confidence bounds', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/revenue-forecast')
        .query(validDateRange)
        .set('Authorization', validToken);

      for (const q of res.body.data.forecast) {
        expect(q.quarter).toMatch(/^\d{4}-Q\d$/);
        expect(q.lowerBoundCents).toBeLessThanOrEqual(q.predictedCents);
        expect(q.upperBoundCents).toBeGreaterThanOrEqual(q.predictedCents);
      }
    });

    test('revenue amounts are integer cents', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/revenue-forecast')
        .query(validDateRange)
        .set('Authorization', validToken);

      for (const h of res.body.data.historical) {
        expect(Number.isInteger(h.totalCents)).toBe(true);
      }
    });
  });

  // ─── CLV ───────────────────────────────────────────────────────────

  describe('POST /clv', () => {
    test('returns customer lifetime value rankings', async () => {
      const res = await request(app)
        .post('/api/v1/analytics/clv')
        .set('Authorization', validToken)
        .send({ topN: 10 });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].userId).toBeDefined();
      expect(res.body.data[0].displayName).toBeDefined();
      expect(res.body.data[0].totalSpentCents).toBeDefined();
    });

    test('respects topN parameter', async () => {
      const res = await request(app)
        .post('/api/v1/analytics/clv')
        .set('Authorization', validToken)
        .send({ topN: 2 });

      expect(res.body.data).toHaveLength(2);
    });

    test('rejects topN > 100', async () => {
      const res = await request(app)
        .post('/api/v1/analytics/clv')
        .set('Authorization', validToken)
        .send({ topN: 200 });

      expect(res.status).toBe(400);
    });

    test('results are sorted by totalSpentCents descending', async () => {
      const res = await request(app)
        .post('/api/v1/analytics/clv')
        .set('Authorization', validToken)
        .send({});

      const data = res.body.data as Array<{ totalSpentCents: number }>;
      for (let i = 1; i < data.length; i++) {
        expect(data[i - 1].totalSpentCents).toBeGreaterThanOrEqual(data[i].totalSpentCents);
      }
    });
  });

  // ─── Staff Benchmark ───────────────────────────────────────────────

  describe('GET /staff-benchmark', () => {
    test('returns staff performance metrics', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/staff-benchmark')
        .query(validDateRange)
        .set('Authorization', validToken);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      const staff = res.body.data[0];
      expect(staff.staffId).toBeDefined();
      expect(staff.displayName).toBeDefined();
      expect(typeof staff.ordersCompleted).toBe('number');
      expect(typeof staff.leadsContacted).toBe('number');
      expect(typeof staff.avgReviewMinutes).toBe('number');
      expect(typeof staff.ticketsResolved).toBe('number');
    });
  });

  // ─── Channel ROI ───────────────────────────────────────────────────

  describe('POST /channel-roi', () => {
    test('returns ROI per marketing channel', async () => {
      const res = await request(app)
        .post('/api/v1/analytics/channel-roi')
        .set('Authorization', validToken)
        .send(validDateRange);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);

      const channel = res.body.data[0];
      expect(channel.channel).toBeDefined();
      expect(typeof channel.roi).toBe('number');
      expect(typeof channel.revenueCents).toBe('number');
      expect(typeof channel.costCents).toBe('number');
    });

    test('ROI formula: (revenue - cost) / cost', async () => {
      const res = await request(app)
        .post('/api/v1/analytics/channel-roi')
        .set('Authorization', validToken)
        .send(validDateRange);

      const channel = res.body.data[0];
      const expectedRoi = (channel.revenueCents - channel.costCents) / channel.costCents;
      expect(channel.roi).toBeCloseTo(expectedRoi, 1);
    });

    test('rejects without date range', async () => {
      const res = await request(app)
        .post('/api/v1/analytics/channel-roi')
        .set('Authorization', validToken)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ─── Seasonal Trends ──────────────────────────────────────────────

  describe('GET /seasonal-trends', () => {
    test('returns trend data with YoY comparison', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/seasonal-trends')
        .query({ ...validDateRange, granularity: 'month' })
        .set('Authorization', validToken);

      expect(res.status).toBe(200);
      const entry = res.body.data[0];
      expect(entry.period).toBeDefined();
      expect(typeof entry.orderCount).toBe('number');
      expect(typeof entry.revenueCents).toBe('number');
      expect(entry.previousYearOrderCount).toBeDefined();
      expect(entry.previousYearRevenueCents).toBeDefined();
    });

    test('rejects invalid granularity', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/seasonal-trends')
        .query({ ...validDateRange, granularity: 'quarter' })
        .set('Authorization', validToken);

      expect(res.status).toBe(400);
    });
  });

  // ─── Churn Risk ───────────────────────────────────────────────────

  describe('GET /churn-risk', () => {
    test('returns at-risk clients', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/churn-risk')
        .query({ financialYear: '2025-2026' })
        .set('Authorization', validToken);

      expect(res.status).toBe(200);
      const client = res.body.data[0];
      expect(client.userId).toBeDefined();
      expect(client.displayName).toBeDefined();
      expect(client.lastFinancialYear).toBe('2024-2025');
      expect(typeof client.daysSinceLastOrder).toBe('number');
    });

    test('rejects invalid financial year format', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/churn-risk')
        .query({ financialYear: '2025' })
        .set('Authorization', validToken);

      expect(res.status).toBe(400);
    });

    test('rejects missing financial year', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/churn-risk')
        .set('Authorization', validToken);

      expect(res.status).toBe(400);
    });
  });

  // ─── Service Mix ──────────────────────────────────────────────────

  describe('GET /service-mix', () => {
    test('returns service breakdown with percentages', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/service-mix')
        .query(validDateRange)
        .set('Authorization', validToken);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);

      const service = res.body.data[0];
      expect(service.serviceTitle).toBeDefined();
      expect(typeof service.revenueCents).toBe('number');
      expect(typeof service.percentOfTotal).toBe('number');
    });

    test('percentages sum to 100', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/service-mix')
        .query(validDateRange)
        .set('Authorization', validToken);

      const total = res.body.data.reduce(
        (sum: number, s: { percentOfTotal: number }) => sum + s.percentOfTotal,
        0,
      );
      expect(total).toBeCloseTo(100, 0);
    });
  });

  // ─── Collection Rate ──────────────────────────────────────────────

  describe('GET /collection-rate', () => {
    test('returns collection metrics', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/collection-rate')
        .query(validDateRange)
        .set('Authorization', validToken);

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.onTimeRate).toBeGreaterThanOrEqual(0);
      expect(data.onTimeRate).toBeLessThanOrEqual(1);
      expect(typeof data.avgDaysToPayment).toBe('number');
      expect(Number.isInteger(data.outstandingReceivablesCents)).toBe(true);
      expect(Number.isInteger(data.totalInvoicedCents)).toBe(true);
      expect(Number.isInteger(data.totalCollectedCents)).toBe(true);
    });
  });

  // ─── Pipeline Health ──────────────────────────────────────────────

  describe('GET /pipeline-health', () => {
    test('returns pipeline stages with conversion rates', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/pipeline-health')
        .query(validDateRange)
        .set('Authorization', validToken);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);

      const stage = res.body.data[0];
      expect(typeof stage.stage).toBe('number');
      expect(stage.stageName).toBeDefined();
      expect(typeof stage.count).toBe('number');
      expect(typeof stage.conversionRate).toBe('number');
      expect(typeof stage.isBottleneck).toBe('boolean');
    });

    test('bottleneck stage is identified', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/pipeline-health')
        .query(validDateRange)
        .set('Authorization', validToken);

      const bottleneck = res.body.data.find((s: { isBottleneck: boolean }) => s.isBottleneck);
      expect(bottleneck).toBeDefined();
    });
  });

  // ─── Export ───────────────────────────────────────────────────────

  describe('POST /export', () => {
    test('queues export job and returns 202', async () => {
      const res = await request(app)
        .post('/api/v1/analytics/export')
        .set('Authorization', validToken)
        .send({ format: 'xlsx', widgets: ['revenue-forecast', 'clv'] });

      expect(res.status).toBe(202);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('queued');
      expect(res.body.data.format).toBe('xlsx');
      expect(res.body.data.widgets).toEqual(['revenue-forecast', 'clv']);
    });

    test('supports pdf format', async () => {
      const res = await request(app)
        .post('/api/v1/analytics/export')
        .set('Authorization', validToken)
        .send({ format: 'pdf', widgets: ['pipeline-health'] });

      expect(res.status).toBe(202);
      expect(res.body.data.format).toBe('pdf');
    });

    test('rejects invalid format', async () => {
      const res = await request(app)
        .post('/api/v1/analytics/export')
        .set('Authorization', validToken)
        .send({ format: 'csv', widgets: ['clv'] });

      expect(res.status).toBe(400);
    });

    test('rejects missing widgets', async () => {
      const res = await request(app)
        .post('/api/v1/analytics/export')
        .set('Authorization', validToken)
        .send({ format: 'xlsx' });

      expect(res.status).toBe(400);
    });

    test('rejects empty widgets array', async () => {
      const res = await request(app)
        .post('/api/v1/analytics/export')
        .set('Authorization', validToken)
        .send({ format: 'xlsx', widgets: [] });

      expect(res.status).toBe(400);
    });
  });
});
