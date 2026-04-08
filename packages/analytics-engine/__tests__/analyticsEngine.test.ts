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
  EXPORT_FORMATS,
  buildCacheKey,
  init,
  validateDateRange,
  validateClv,
  validateChannelRoi,
  validateExport,
  validateFinancialYear,
  validateGranularity,
  createAnalyticsRoutes,
} from '../src';

// ─── Constants ──────────────────────────────────────────────────────────────

describe('Analytics Engine — Constants', () => {
  test('REVENUE_PAYMENT_STATUSES is exactly ["succeeded", "captured"] (ANA-INV-02)', () => {
    expect(REVENUE_PAYMENT_STATUSES).toEqual(['succeeded', 'captured']);
    expect(REVENUE_PAYMENT_STATUSES).toHaveLength(2);
  });

  test('ANALYTICS_VIEWS contains all 10 widget names', () => {
    expect(ANALYTICS_VIEWS).toHaveLength(10);
    expect(ANALYTICS_VIEWS).toContain('executive-summary');
    expect(ANALYTICS_VIEWS).toContain('revenue-forecast');
    expect(ANALYTICS_VIEWS).toContain('clv');
    expect(ANALYTICS_VIEWS).toContain('staff-benchmark');
    expect(ANALYTICS_VIEWS).toContain('channel-roi');
    expect(ANALYTICS_VIEWS).toContain('seasonal-trends');
    expect(ANALYTICS_VIEWS).toContain('churn-risk');
    expect(ANALYTICS_VIEWS).toContain('service-mix');
    expect(ANALYTICS_VIEWS).toContain('collection-rate');
    expect(ANALYTICS_VIEWS).toContain('pipeline-health');
  });

  test('MAX_DATE_RANGE_DAYS is 366 (ANA-INV-05)', () => {
    expect(MAX_DATE_RANGE_DAYS).toBe(366);
  });

  test('DEFAULT_CACHE_TTL is 300 seconds (ANA-INV-06)', () => {
    expect(DEFAULT_CACHE_TTL).toBe(300);
  });

  test('default benchmark values are correct (ANA-INV-04)', () => {
    expect(DEFAULT_YEAR1_CONVERSION_RATE).toBe(0.62);
    expect(DEFAULT_AVG_ORDER_VALUE_CENTS).toBe(85000);
    expect(DEFAULT_BENCHMARK_MONTHS).toBe(12);
  });

  test('DEFAULT_EXPORT_EXPIRY_HOURS is 48', () => {
    expect(DEFAULT_EXPORT_EXPIRY_HOURS).toBe(48);
  });

  test('LEAD_STATUS_NAMES covers statuses 1-8', () => {
    for (let i = 1; i <= 8; i++) {
      expect(LEAD_STATUS_NAMES[i]).toBeDefined();
      expect(typeof LEAD_STATUS_NAMES[i]).toBe('string');
    }
    expect(LEAD_STATUS_NAMES[1]).toBe('New');
    expect(LEAD_STATUS_NAMES[6]).toBe('Won');
    expect(LEAD_STATUS_NAMES[7]).toBe('Lost');
    expect(LEAD_STATUS_NAMES[8]).toBe('Dormant');
  });

  test('EXPORT_FORMATS contains pdf and xlsx', () => {
    expect(EXPORT_FORMATS).toEqual(['pdf', 'xlsx']);
  });
});

// ─── Cache Service ──────────────────────────────────────────────────────────

describe('Analytics Engine — Cache', () => {
  test('buildCacheKey produces correct format analytics:{view}:{hash}', () => {
    const key = buildCacheKey('revenue-forecast', { dateFrom: '2025-01-01', dateTo: '2025-12-31' });
    expect(key).toMatch(/^analytics:revenue-forecast:[a-f0-9]+$/);
  });

  test('buildCacheKey produces different keys for different params', () => {
    const key1 = buildCacheKey('clv', { topN: 10 });
    const key2 = buildCacheKey('clv', { topN: 20 });
    expect(key1).not.toBe(key2);
  });

  test('buildCacheKey produces same key for same params', () => {
    const params = { dateFrom: '2025-01-01', dateTo: '2025-06-30' };
    const key1 = buildCacheKey('service-mix', params);
    const key2 = buildCacheKey('service-mix', params);
    expect(key1).toBe(key2);
  });

  test('buildCacheKey handles empty params', () => {
    const key = buildCacheKey('executive-summary', {});
    expect(key).toMatch(/^analytics:executive-summary:[a-f0-9]+$/);
  });
});

// ─── Init ───────────────────────────────────────────────────────────────────

describe('Analytics Engine — Init', () => {
  test('init returns config with defaults when no args provided', () => {
    const config = init();
    expect(config.year1ConversionRate).toBe(0.62);
    expect(config.averageOrderValueCents).toBe(85000);
    expect(config.benchmarkMonthsThreshold).toBe(12);
    expect(config.cacheTtlSeconds).toBe(300);
    expect(config.exportExpiryHours).toBe(48);
    expect(config.analyticsReplicaUri).toBeUndefined();
  });

  test('init respects provided config values', () => {
    const config = init({
      year1ConversionRate: 0.75,
      averageOrderValueCents: 100000,
      benchmarkMonthsThreshold: 6,
      cacheTtlSeconds: 600,
      exportExpiryHours: 24,
      analyticsReplicaUri: 'mongodb://replica:27017/qegos',
    });
    expect(config.year1ConversionRate).toBe(0.75);
    expect(config.averageOrderValueCents).toBe(100000);
    expect(config.benchmarkMonthsThreshold).toBe(6);
    expect(config.cacheTtlSeconds).toBe(600);
    expect(config.exportExpiryHours).toBe(24);
    expect(config.analyticsReplicaUri).toBe('mongodb://replica:27017/qegos');
  });

  test('init partially overrides defaults', () => {
    const config = init({ cacheTtlSeconds: 60 });
    expect(config.cacheTtlSeconds).toBe(60);
    expect(config.year1ConversionRate).toBe(0.62); // default
  });
});

// ─── Validators ─────────────────────────────────────────────────────────────

describe('Analytics Engine — Validators', () => {
  test('validateDateRange returns 2 validators', () => {
    const chains = validateDateRange();
    expect(chains).toHaveLength(2);
  });

  test('validateClv returns 3 validators', () => {
    const chains = validateClv();
    expect(chains).toHaveLength(3);
  });

  test('validateChannelRoi returns 4 validators', () => {
    const chains = validateChannelRoi();
    expect(chains).toHaveLength(4);
  });

  test('validateExport returns 5 validators', () => {
    const chains = validateExport();
    expect(chains).toHaveLength(5);
  });

  test('validateFinancialYear returns 1 validator', () => {
    const chains = validateFinancialYear();
    expect(chains).toHaveLength(1);
  });

  test('validateGranularity returns 1 validator', () => {
    const chains = validateGranularity();
    expect(chains).toHaveLength(1);
  });
});

// ─── Route Factory ──────────────────────────────────────────────────────────

describe('Analytics Engine — Routes', () => {
  test('createAnalyticsRoutes is exported as a function', () => {
    expect(typeof createAnalyticsRoutes).toBe('function');
  });
});

// ─── Invariant Summary ──────────────────────────────────────────────────────

describe('Analytics Engine — Invariants', () => {
  test('ANA-INV-02: Revenue only from Payment statuses (succeeded, captured)', () => {
    // This is a structural test — the constant is used in all revenue queries
    expect(REVENUE_PAYMENT_STATUSES).toEqual(['succeeded', 'captured']);
    // No 'refunded', 'failed', 'pending' etc.
    expect(REVENUE_PAYMENT_STATUSES).not.toContain('refunded');
    expect(REVENUE_PAYMENT_STATUSES).not.toContain('pending');
    expect(REVENUE_PAYMENT_STATUSES).not.toContain('failed');
  });

  test('ANA-INV-04: isEstimated flag when < 12 months — benchmark threshold is 12', () => {
    expect(DEFAULT_BENCHMARK_MONTHS).toBe(12);
  });

  test('ANA-INV-05: date range max 366 days', () => {
    expect(MAX_DATE_RANGE_DAYS).toBe(366);
  });

  test('ANA-INV-06: 5-min cache default', () => {
    expect(DEFAULT_CACHE_TTL).toBe(300);
  });

  test('ANA-INV-07: executive-summary is a recognized view for pre-computation', () => {
    expect(ANALYTICS_VIEWS).toContain('executive-summary');
  });

  test('EXPORT_FORMATS are pdf and xlsx only', () => {
    expect(EXPORT_FORMATS).toHaveLength(2);
    expect(EXPORT_FORMATS).toContain('pdf');
    expect(EXPORT_FORMATS).toContain('xlsx');
  });
});
