/**
 * Analytics Engine — Tests
 *
 * Tests for @nugen/analytics-engine: constants, cache key generation,
 * revenue status invariants, forecast mode, validators, route factory.
 * Unit/structural tests — no database required.
 */

import {
  REVENUE_PAYMENT_STATUSES,
  ANALYTICS_VIEWS,
  MAX_DATE_RANGE_DAYS,
  DEFAULT_CACHE_TTL,
  DEFAULT_YEAR1_CONVERSION_RATE,
  DEFAULT_AVG_ORDER_VALUE_CENTS,
  DEFAULT_BENCHMARK_MONTHS,
  DEFAULT_EXPORT_EXPIRY_HOURS,
  LEAD_STATUS_NAMES,
  ORDER_STATUS_NAMES,
  init,
  buildCacheKey,
  createAnalyticsRoutes,
} from '../src';

import type {
  AnalyticsEngineConfig,
  AnalyticsRouteDeps,
  AnalyticsView,
  DateRangeParams,
  Granularity,
  RevenueBucket,
  RevenueForecastResponse,
  ForecastQuarter,
  ClvEntry,
  StaffBenchmarkEntry,
  ChannelRoiEntry,
  SeasonalTrendEntry,
  ChurnRiskEntry,
  ServiceMixEntry,
  CollectionRateResponse,
  PipelineStageEntry,
  ExecutiveSummaryResponse,
  ExportJobResponse,
} from '../src';

import {
  validateDateRange,
  validateClv,
  validateChannelRoi,
  validateExport,
  validateFinancialYear,
  validateGranularity,
} from '../src/validators/analyticsValidators';

// ═══════════════════════════════════════════════════════════════════════════════

describe('@nugen/analytics-engine', () => {
  // ─── Constants ────────────────────────────────────────────────────────────

  describe('Constants', () => {
    it('REVENUE_PAYMENT_STATUSES is exactly succeeded and captured (ANA-INV-02)', () => {
      expect([...REVENUE_PAYMENT_STATUSES]).toEqual(['succeeded', 'captured']);
      expect(REVENUE_PAYMENT_STATUSES).toHaveLength(2);
    });

    it('ANALYTICS_VIEWS has 10 widget views', () => {
      expect(ANALYTICS_VIEWS).toHaveLength(10);
      expect(ANALYTICS_VIEWS).toContain('executive-summary');
      expect(ANALYTICS_VIEWS).toContain('revenue-forecast');
      expect(ANALYTICS_VIEWS).toContain('clv');
      expect(ANALYTICS_VIEWS).toContain('pipeline-health');
    });

    it('MAX_DATE_RANGE_DAYS is 366 (ANA-INV-05)', () => {
      expect(MAX_DATE_RANGE_DAYS).toBe(366);
    });

    it('DEFAULT_CACHE_TTL is 300 seconds (5 min)', () => {
      expect(DEFAULT_CACHE_TTL).toBe(300);
    });

    it('DEFAULT_YEAR1_CONVERSION_RATE is 0.62', () => {
      expect(DEFAULT_YEAR1_CONVERSION_RATE).toBe(0.62);
    });

    it('DEFAULT_AVG_ORDER_VALUE_CENTS is 85000 ($850)', () => {
      expect(DEFAULT_AVG_ORDER_VALUE_CENTS).toBe(85000);
    });

    it('DEFAULT_BENCHMARK_MONTHS is 12', () => {
      expect(DEFAULT_BENCHMARK_MONTHS).toBe(12);
    });

    it('DEFAULT_EXPORT_EXPIRY_HOURS is 48', () => {
      expect(DEFAULT_EXPORT_EXPIRY_HOURS).toBe(48);
    });

    it('LEAD_STATUS_NAMES maps 8 statuses', () => {
      expect(Object.keys(LEAD_STATUS_NAMES)).toHaveLength(8);
      expect(LEAD_STATUS_NAMES[1]).toBe('New');
      expect(LEAD_STATUS_NAMES[6]).toBe('Won');
      expect(LEAD_STATUS_NAMES[7]).toBe('Lost');
      expect(LEAD_STATUS_NAMES[8]).toBe('Dormant');
    });

    it('ORDER_STATUS_NAMES maps 9 statuses', () => {
      expect(Object.keys(ORDER_STATUS_NAMES)).toHaveLength(9);
      expect(ORDER_STATUS_NAMES[1]).toBe('Pending');
      expect(ORDER_STATUS_NAMES[6]).toBe('Completed');
      expect(ORDER_STATUS_NAMES[9]).toBe('Cancelled');
    });
  });

  // ─── Init ─────────────────────────────────────────────────────────────────

  describe('init()', () => {
    it('returns config with all defaults when no args', () => {
      const config = init();
      expect(config.cacheTtlSeconds).toBe(DEFAULT_CACHE_TTL);
      expect(config.year1ConversionRate).toBe(DEFAULT_YEAR1_CONVERSION_RATE);
      expect(config.averageOrderValueCents).toBe(DEFAULT_AVG_ORDER_VALUE_CENTS);
      expect(config.benchmarkMonthsThreshold).toBe(DEFAULT_BENCHMARK_MONTHS);
      expect(config.exportExpiryHours).toBe(DEFAULT_EXPORT_EXPIRY_HOURS);
      expect(config.analyticsReplicaUri).toBeUndefined();
    });

    it('overrides defaults with provided values', () => {
      const config = init({
        cacheTtlSeconds: 60,
        year1ConversionRate: 0.5,
        analyticsReplicaUri: 'mongodb://replica:27017/analytics',
      });
      expect(config.cacheTtlSeconds).toBe(60);
      expect(config.year1ConversionRate).toBe(0.5);
      expect(config.analyticsReplicaUri).toBe('mongodb://replica:27017/analytics');
      // Defaults still applied for omitted values
      expect(config.averageOrderValueCents).toBe(DEFAULT_AVG_ORDER_VALUE_CENTS);
    });
  });

  // ─── Cache Key Generation ─────────────────────────────────────────────────

  describe('buildCacheKey()', () => {
    it('produces key in format analytics:{view}:{hash}', () => {
      const key = buildCacheKey('revenue-forecast', {
        dateFrom: '2025-01-01',
        dateTo: '2025-12-31',
      });
      expect(key).toMatch(/^analytics:revenue-forecast:[a-f0-9]{12}$/);
    });

    it('same params produce same key', () => {
      const params = { dateFrom: '2025-01-01', dateTo: '2025-06-30' };
      const key1 = buildCacheKey('clv', params);
      const key2 = buildCacheKey('clv', params);
      expect(key1).toBe(key2);
    });

    it('different params produce different keys', () => {
      const key1 = buildCacheKey('clv', { topN: 10 });
      const key2 = buildCacheKey('clv', { topN: 50 });
      expect(key1).not.toBe(key2);
    });

    it('params with same keys in different order produce same key', () => {
      const key1 = buildCacheKey('test', { a: 1, b: 2 });
      const key2 = buildCacheKey('test', { b: 2, a: 1 });
      expect(key1).toBe(key2);
    });

    it('empty params produce consistent key', () => {
      const key = buildCacheKey('staff-benchmark');
      expect(key).toMatch(/^analytics:staff-benchmark:[a-f0-9]{12}$/);
    });
  });

  // ─── Revenue Invariant (ANA-INV-02) ───────────────────────────────────────

  describe('Revenue Payment Status Invariant', () => {
    it('REVENUE_PAYMENT_STATUSES does not include pending', () => {
      expect(REVENUE_PAYMENT_STATUSES).not.toContain('pending');
    });

    it('REVENUE_PAYMENT_STATUSES does not include failed', () => {
      expect(REVENUE_PAYMENT_STATUSES).not.toContain('failed');
    });

    it('REVENUE_PAYMENT_STATUSES does not include refunded', () => {
      expect(REVENUE_PAYMENT_STATUSES).not.toContain('refunded');
    });

    it('REVENUE_PAYMENT_STATUSES does not include disputed', () => {
      expect(REVENUE_PAYMENT_STATUSES).not.toContain('disputed');
    });
  });

  // ─── Forecast Types ───────────────────────────────────────────────────────

  describe('Forecast Response Shape', () => {
    it('RevenueForecastResponse has isEstimated flag (ANA-INV-04)', () => {
      const response: RevenueForecastResponse = {
        historical: [],
        forecast: [],
        isEstimated: true,
        dataMonths: 3,
      };
      expect(response.isEstimated).toBe(true);
      expect(response.dataMonths).toBeLessThan(DEFAULT_BENCHMARK_MONTHS);
    });

    it('ForecastQuarter has confidence bounds', () => {
      const quarter: ForecastQuarter = {
        quarter: '2026-Q3',
        predictedCents: 500000,
        lowerBoundCents: 400000,
        upperBoundCents: 600000,
      };
      expect(quarter.lowerBoundCents).toBeLessThan(quarter.predictedCents);
      expect(quarter.upperBoundCents).toBeGreaterThan(quarter.predictedCents);
    });
  });

  // ─── Type Shapes ──────────────────────────────────────────────────────────

  describe('Type Shapes', () => {
    it('CollectionRateResponse has all fields', () => {
      const cr: CollectionRateResponse = {
        onTimeRate: 0.85,
        avgDaysToPayment: 14,
        outstandingReceivablesCents: 50000,
        totalInvoicedCents: 1000000,
        totalCollectedCents: 850000,
      };
      expect(cr.onTimeRate).toBeGreaterThanOrEqual(0);
      expect(cr.onTimeRate).toBeLessThanOrEqual(1);
    });

    it('PipelineStageEntry has isBottleneck flag', () => {
      const entry: PipelineStageEntry = {
        stage: 3,
        stageName: 'Qualified',
        count: 45,
        totalValueCents: 3000000,
        conversionRate: 0.67,
        avgDaysInStage: 5,
        isBottleneck: true,
      };
      expect(entry.isBottleneck).toBe(true);
    });

    it('ExecutiveSummaryResponse has all dashboard sections', () => {
      const summary: ExecutiveSummaryResponse = {
        generatedAt: new Date().toISOString(),
        revenue: { totalCents: 0, monthOverMonth: 0, forecast: [], isEstimated: true },
        pipeline: { totalLeads: 0, conversionRate: 0, avgDaysToConvert: 0 },
        orders: { totalActive: 0, completedThisMonth: 0, avgCompletionPercent: 0 },
        churn: { atRiskCount: 0 },
        collection: { onTimeRate: 0, outstandingCents: 0 },
      };
      expect(summary).toHaveProperty('revenue');
      expect(summary).toHaveProperty('pipeline');
      expect(summary).toHaveProperty('orders');
      expect(summary).toHaveProperty('churn');
      expect(summary).toHaveProperty('collection');
    });

    it('ExportJobResponse has jobId and status', () => {
      const job: ExportJobResponse = {
        jobId: 'abc-123',
        status: 'queued',
        format: 'xlsx',
        widgets: ['revenue-forecast', 'clv'],
      };
      expect(job.status).toBe('queued');
      expect(job.widgets).toHaveLength(2);
    });

    it('ChannelRoiEntry has ROI calculation field', () => {
      const entry: ChannelRoiEntry = {
        channel: 'google_ads',
        campaignCount: 5,
        leadsGenerated: 100,
        conversions: 30,
        revenueCents: 500000,
        costCents: 100000,
        roi: 4.0,
      };
      expect(entry.roi).toBe((entry.revenueCents - entry.costCents) / entry.costCents);
    });
  });

  // ─── Date Range Constraint (ANA-INV-05) ───────────────────────────────────

  describe('Date Range Validation', () => {
    it('MAX_DATE_RANGE_DAYS is 366 (allows full leap year)', () => {
      expect(MAX_DATE_RANGE_DAYS).toBe(366);
      expect(MAX_DATE_RANGE_DAYS).toBeGreaterThan(365);
    });
  });

  // ─── Validators ───────────────────────────────────────────────────────────

  describe('Validators', () => {
    it('validateDateRange returns 2 chains', () => {
      const chains = validateDateRange();
      expect(Array.isArray(chains)).toBe(true);
      expect(chains).toHaveLength(2);
    });

    it('validateClv returns 4 chains', () => {
      const chains = validateClv();
      expect(Array.isArray(chains)).toBe(true);
      expect(chains).toHaveLength(4);
    });

    it('validateChannelRoi returns 4 chains', () => {
      const chains = validateChannelRoi();
      expect(Array.isArray(chains)).toBe(true);
      expect(chains).toHaveLength(4);
    });

    it('validateExport returns 5 chains', () => {
      const chains = validateExport();
      expect(Array.isArray(chains)).toBe(true);
      expect(chains).toHaveLength(5);
    });

    it('validateFinancialYear returns 1 chain', () => {
      const chains = validateFinancialYear();
      expect(Array.isArray(chains)).toBe(true);
      expect(chains).toHaveLength(1);
    });

    it('validateGranularity returns 1 chain', () => {
      const chains = validateGranularity();
      expect(Array.isArray(chains)).toBe(true);
      expect(chains).toHaveLength(1);
    });
  });

  // ─── Route Factory ────────────────────────────────────────────────────────

  describe('Route Factory', () => {
    it('createAnalyticsRoutes is a function', () => {
      expect(typeof createAnalyticsRoutes).toBe('function');
    });
  });

  // ─── Module Exports ───────────────────────────────────────────────────────

  describe('Package Exports', () => {
    it('exports init function', () => {
      const mod = require('../src');
      expect(typeof mod.init).toBe('function');
    });

    it('exports all service functions', () => {
      const mod = require('../src');
      expect(typeof mod.computeExecutiveSummary).toBe('function');
      expect(typeof mod.getExecutiveSummary).toBe('function');
      expect(typeof mod.getRevenueByPeriod).toBe('function');
      expect(typeof mod.getCollectionRate).toBe('function');
      expect(typeof mod.getRevenueForecast).toBe('function');
      expect(typeof mod.getClv).toBe('function');
      expect(typeof mod.getStaffBenchmark).toBe('function');
      expect(typeof mod.getChannelRoi).toBe('function');
      expect(typeof mod.getSeasonalTrends).toBe('function');
      expect(typeof mod.getChurnRisk).toBe('function');
      expect(typeof mod.getServiceMix).toBe('function');
      expect(typeof mod.getPipelineHealth).toBe('function');
      expect(typeof mod.createExportJob).toBe('function');
    });

    it('exports cache utilities', () => {
      const mod = require('../src');
      expect(typeof mod.buildCacheKey).toBe('function');
      expect(typeof mod.withCache).toBe('function');
      expect(typeof mod.getCached).toBe('function');
      expect(typeof mod.setCache).toBe('function');
    });

    it('exports all validator functions', () => {
      const mod = require('../src');
      expect(typeof mod.validateDateRange).toBe('function');
      expect(typeof mod.validateClv).toBe('function');
      expect(typeof mod.validateChannelRoi).toBe('function');
      expect(typeof mod.validateExport).toBe('function');
      expect(typeof mod.validateFinancialYear).toBe('function');
      expect(typeof mod.validateGranularity).toBe('function');
    });

    it('exports route factory', () => {
      const mod = require('../src');
      expect(typeof mod.createAnalyticsRoutes).toBe('function');
    });
  });
});
