/**
 * Analytics Engine — Service Tests
 *
 * Tests each analytics service with mock Mongoose models.
 * Validates aggregation logic, filtering, edge cases, and invariants.
 * No database required — models are faked with jest.fn().
 */

import type { Model, Document } from 'mongoose';
import { getRevenueByPeriod, getCollectionRate } from '../src/services/revenueService';
import { getRevenueForecast } from '../src/services/forecastService';
import { getClv } from '../src/services/clvService';
import { getPipelineHealth } from '../src/services/pipelineHealthService';
import { getChurnRisk } from '../src/services/churnRiskService';
import { getServiceMix } from '../src/services/serviceMixService';
import { getSeasonalTrends } from '../src/services/seasonalTrendsService';
import { getStaffBenchmark } from '../src/services/staffBenchmarkService';
import { getChannelRoi } from '../src/services/channelRoiService';
import { createExportJob } from '../src/services/exportService';
import { buildCacheKey, getCached, setCache, withCache } from '../src/services/cacheService';
import { REVENUE_PAYMENT_STATUSES } from '../src/constants';
import type { AnalyticsEngineConfig, DateRangeParams } from '../src/types';

// ─── Helpers ───────────────────────────────────────────────────────────────

type MockModel = {
  aggregate: jest.Mock;
  find: jest.Mock;
  countDocuments: jest.Mock;
};

function createMockModel(aggregateResult: unknown[] = []): MockModel {
  return {
    aggregate: jest.fn().mockResolvedValue(aggregateResult),
    find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    countDocuments: jest.fn().mockResolvedValue(0),
  };
}

function createMockRedis(): Record<string, jest.Mock> {
  const store = new Map<string, string>();
  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    ttl: jest.fn(async () => 200),
  };
}

const dateRange: DateRangeParams = {
  dateFrom: new Date('2025-01-01'),
  dateTo: new Date('2025-12-31'),
};

// ═══════════════════════════════════════════════════════════════════════════════

describe('Analytics Engine Services', () => {
  // ─── Revenue Service ─────────────────────────────────────────────────────

  describe('revenueService', () => {
    describe('getRevenueByPeriod', () => {
      it('returns monthly revenue buckets', async () => {
        const PaymentModel = createMockModel([
          { period: '2025-01', totalCents: 100000, count: 5 },
          { period: '2025-02', totalCents: 150000, count: 8 },
        ]);

        const result = await getRevenueByPeriod(
          PaymentModel as unknown as Model<Document>,
          dateRange,
          'month',
        );

        expect(result).toHaveLength(2);
        expect(result[0].period).toBe('2025-01');
        expect(result[0].totalCents).toBe(100000);
        expect(result[1].count).toBe(8);
      });

      it('passes REVENUE_PAYMENT_STATUSES filter to aggregate', async () => {
        const PaymentModel = createMockModel([]);
        await getRevenueByPeriod(PaymentModel as unknown as Model<Document>, dateRange);

        const pipeline = PaymentModel.aggregate.mock.calls[0][0];
        const matchStage = pipeline[0].$match;
        expect(matchStage.status.$in).toEqual([...REVENUE_PAYMENT_STATUSES]);
      });

      it('uses week format when groupBy is week', async () => {
        const PaymentModel = createMockModel([{ period: '2025-W01', totalCents: 50000, count: 3 }]);

        const result = await getRevenueByPeriod(
          PaymentModel as unknown as Model<Document>,
          dateRange,
          'week',
        );

        expect(result[0].period).toBe('2025-W01');
        // Check the $dateToString format used
        const pipeline = PaymentModel.aggregate.mock.calls[0][0];
        const groupStage = pipeline[1].$group;
        expect(groupStage._id.$dateToString.format).toBe('%Y-W%V');
      });

      it('defaults to month grouping', async () => {
        const PaymentModel = createMockModel([]);
        await getRevenueByPeriod(PaymentModel as unknown as Model<Document>, dateRange);

        const pipeline = PaymentModel.aggregate.mock.calls[0][0];
        const groupStage = pipeline[1].$group;
        expect(groupStage._id.$dateToString.format).toBe('%Y-%m');
      });

      it('returns empty array for no data', async () => {
        const PaymentModel = createMockModel([]);
        const result = await getRevenueByPeriod(
          PaymentModel as unknown as Model<Document>,
          dateRange,
        );
        expect(result).toEqual([]);
      });
    });

    describe('getCollectionRate', () => {
      it('computes on-time rate from invoiced vs collected', async () => {
        const PaymentModel = createMockModel();
        const OrderModel = createMockModel();

        // First call: OrderModel.aggregate (invoiced)
        OrderModel.aggregate.mockResolvedValueOnce([{ totalInvoicedCents: 1000000 }]);
        // Second call: PaymentModel.aggregate (collected)
        PaymentModel.aggregate
          .mockResolvedValueOnce([{ totalCollectedCents: 850000, avgDays: 14.5, count: 10 }])
          .mockResolvedValueOnce([{ outstandingCents: 50000 }]);

        const result = await getCollectionRate(
          PaymentModel as unknown as Model<Document>,
          OrderModel as unknown as Model<Document>,
          dateRange,
        );

        expect(result.onTimeRate).toBe(0.85);
        expect(result.avgDaysToPayment).toBe(15); // rounded
        expect(result.outstandingReceivablesCents).toBe(50000);
        expect(result.totalInvoicedCents).toBe(1000000);
        expect(result.totalCollectedCents).toBe(850000);
      });

      it('returns zero rate when no invoices', async () => {
        const PaymentModel = createMockModel();
        const OrderModel = createMockModel();

        OrderModel.aggregate.mockResolvedValueOnce([]);
        PaymentModel.aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

        const result = await getCollectionRate(
          PaymentModel as unknown as Model<Document>,
          OrderModel as unknown as Model<Document>,
          dateRange,
        );

        expect(result.onTimeRate).toBe(0);
        expect(result.totalInvoicedCents).toBe(0);
      });

      it('caps on-time rate at 1.0', async () => {
        const PaymentModel = createMockModel();
        const OrderModel = createMockModel();

        OrderModel.aggregate.mockResolvedValueOnce([{ totalInvoicedCents: 100000 }]);
        PaymentModel.aggregate
          .mockResolvedValueOnce([{ totalCollectedCents: 200000, avgDays: 5, count: 3 }])
          .mockResolvedValueOnce([]);

        const result = await getCollectionRate(
          PaymentModel as unknown as Model<Document>,
          OrderModel as unknown as Model<Document>,
          dateRange,
        );

        expect(result.onTimeRate).toBe(1);
      });
    });
  });

  // ─── Forecast Service ────────────────────────────────────────────────────

  describe('forecastService', () => {
    const config: AnalyticsEngineConfig = {
      year1ConversionRate: 0.62,
      averageOrderValueCents: 85000,
      benchmarkMonthsThreshold: 12,
    };

    it('uses benchmark mode when < 12 months data (ANA-INV-04)', async () => {
      const PaymentModel = createMockModel([
        { period: '2025-01', totalCents: 100000, count: 5 },
        { period: '2025-02', totalCents: 120000, count: 6 },
      ]);

      const result = await getRevenueForecast(
        PaymentModel as unknown as Model<Document>,
        config,
        dateRange,
      );

      expect(result.isEstimated).toBe(true);
      expect(result.dataMonths).toBe(2);
      expect(result.forecast).toHaveLength(4);
      expect(result.forecast[0].quarter).toMatch(/^\d{4}-Q\d$/);
    });

    it('uses linear regression when >= 12 months data', async () => {
      const months = Array.from({ length: 14 }, (_, i) => ({
        period: `2024-${String(i + 1).padStart(2, '0')}`,
        totalCents: 100000 + i * 5000,
        count: 5 + i,
      }));

      const PaymentModel = createMockModel(months);

      const result = await getRevenueForecast(
        PaymentModel as unknown as Model<Document>,
        config,
        dateRange,
      );

      expect(result.isEstimated).toBe(false);
      expect(result.dataMonths).toBe(14);
      expect(result.forecast).toHaveLength(4);
    });

    it('forecast quarters have confidence bounds', async () => {
      const PaymentModel = createMockModel([{ period: '2025-01', totalCents: 100000, count: 5 }]);

      const result = await getRevenueForecast(
        PaymentModel as unknown as Model<Document>,
        config,
        dateRange,
      );

      for (const q of result.forecast) {
        expect(q.lowerBoundCents).toBeLessThanOrEqual(q.predictedCents);
        expect(q.upperBoundCents).toBeGreaterThanOrEqual(q.predictedCents);
      }
    });

    it('returns empty forecast for zero data', async () => {
      const PaymentModel = createMockModel([]);

      const result = await getRevenueForecast(
        PaymentModel as unknown as Model<Document>,
        config,
        dateRange,
      );

      expect(result.isEstimated).toBe(true);
      expect(result.dataMonths).toBe(0);
      expect(result.forecast).toHaveLength(4);
    });

    it('filters by REVENUE_PAYMENT_STATUSES', async () => {
      const PaymentModel = createMockModel([]);
      await getRevenueForecast(PaymentModel as unknown as Model<Document>, config, dateRange);

      const pipeline = PaymentModel.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match.status.$in).toEqual([...REVENUE_PAYMENT_STATUSES]);
    });
  });

  // ─── CLV Service ─────────────────────────────────────────────────────────

  describe('clvService', () => {
    it('returns top customers ranked by total spent', async () => {
      const PaymentModel = createMockModel([
        {
          _id: 'user-1',
          totalSpentCents: 500000,
          paymentCount: 10,
          firstPayment: new Date(),
          lastPayment: new Date(),
        },
        {
          _id: 'user-2',
          totalSpentCents: 300000,
          paymentCount: 6,
          firstPayment: new Date(),
          lastPayment: new Date(),
        },
      ]);
      const UserModel = createMockModel();
      UserModel.find = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'user-1', firstName: 'Alice', lastName: 'Smith' },
          { _id: 'user-2', firstName: 'Bob', lastName: 'Jones' },
        ]),
      });

      const result = await getClv(
        PaymentModel as unknown as Model<Document>,
        UserModel as unknown as Model<Document>,
        { topN: 10 },
      );

      expect(result).toHaveLength(2);
      expect(result[0].totalSpentCents).toBe(500000);
      expect(result[0].displayName).toBe('Alice Smith');
      expect(result[1].displayName).toBe('Bob Jones');
    });

    it('returns empty array when no payments', async () => {
      const PaymentModel = createMockModel([]);
      const UserModel = createMockModel();

      const result = await getClv(
        PaymentModel as unknown as Model<Document>,
        UserModel as unknown as Model<Document>,
      );

      expect(result).toEqual([]);
    });

    it('filters by REVENUE_PAYMENT_STATUSES (ANA-INV-03)', async () => {
      const PaymentModel = createMockModel([]);
      const UserModel = createMockModel();

      await getClv(
        PaymentModel as unknown as Model<Document>,
        UserModel as unknown as Model<Document>,
      );

      const pipeline = PaymentModel.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match.status.$in).toEqual([...REVENUE_PAYMENT_STATUSES]);
    });

    it('applies date range filter when provided', async () => {
      const PaymentModel = createMockModel([]);
      const UserModel = createMockModel();

      await getClv(
        PaymentModel as unknown as Model<Document>,
        UserModel as unknown as Model<Document>,
        { dateRange },
      );

      const pipeline = PaymentModel.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match.createdAt).toBeDefined();
      expect(pipeline[0].$match.createdAt.$gte).toEqual(dateRange.dateFrom);
    });

    it('respects topN limit', async () => {
      const PaymentModel = createMockModel([]);
      const UserModel = createMockModel();

      await getClv(
        PaymentModel as unknown as Model<Document>,
        UserModel as unknown as Model<Document>,
        { topN: 5 },
      );

      const pipeline = PaymentModel.aggregate.mock.calls[0][0];
      const limitStage = pipeline.find((s: Record<string, unknown>) => '$limit' in s);
      expect(limitStage.$limit).toBe(5);
    });

    it('defaults topN to 50', async () => {
      const PaymentModel = createMockModel([]);
      const UserModel = createMockModel();

      await getClv(
        PaymentModel as unknown as Model<Document>,
        UserModel as unknown as Model<Document>,
      );

      const pipeline = PaymentModel.aggregate.mock.calls[0][0];
      const limitStage = pipeline.find((s: Record<string, unknown>) => '$limit' in s);
      expect(limitStage.$limit).toBe(50);
    });
  });

  // ─── Pipeline Health Service ─────────────────────────────────────────────

  describe('pipelineHealthService', () => {
    it('returns all 8 stages', async () => {
      const LeadModel = createMockModel([
        { _id: 1, count: 20, totalValueCents: 500000 },
        { _id: 3, count: 15, totalValueCents: 400000 },
        { _id: 6, count: 10, totalValueCents: 300000 },
      ]);
      const LeadActivityModel = createMockModel([]);

      const result = await getPipelineHealth(
        LeadModel as unknown as Model<Document>,
        LeadActivityModel as unknown as Model<Document>,
        dateRange,
      );

      expect(result).toHaveLength(8);
      expect(result[0].stage).toBe(1);
      expect(result[0].stageName).toBe('New');
      expect(result[7].stage).toBe(8);
      expect(result[7].stageName).toBe('Dormant');
    });

    it('marks stage with most leads as bottleneck (if < stage 6)', async () => {
      const LeadModel = createMockModel([
        { _id: 1, count: 5, totalValueCents: 100000 },
        { _id: 3, count: 50, totalValueCents: 1000000 }, // highest count
        { _id: 6, count: 10, totalValueCents: 300000 },
      ]);
      const LeadActivityModel = createMockModel([]);

      const result = await getPipelineHealth(
        LeadModel as unknown as Model<Document>,
        LeadActivityModel as unknown as Model<Document>,
        dateRange,
      );

      // Stage 3 (Qualified) should be bottleneck
      const qualified = result.find((r) => r.stage === 3);
      expect(qualified?.isBottleneck).toBe(true);

      // Stage 6 (Won) should NOT be bottleneck even if it had max count
      const won = result.find((r) => r.stage === 6);
      expect(won?.isBottleneck).toBe(false);
    });

    it('handles empty pipeline', async () => {
      const LeadModel = createMockModel([]);
      const LeadActivityModel = createMockModel([]);

      const result = await getPipelineHealth(
        LeadModel as unknown as Model<Document>,
        LeadActivityModel as unknown as Model<Document>,
        dateRange,
      );

      expect(result).toHaveLength(8);
      result.forEach((entry) => {
        expect(entry.count).toBe(0);
        expect(entry.totalValueCents).toBe(0);
        expect(entry.isBottleneck).toBe(false);
      });
    });
  });

  // ─── Churn Risk Service ──────────────────────────────────────────────────

  describe('churnRiskService', () => {
    it('identifies users who filed last FY but not current', async () => {
      const TaxYearSummaryModel = createMockModel();
      const UserModel = createMockModel();

      // First call: last FY users
      TaxYearSummaryModel.aggregate
        .mockResolvedValueOnce([{ _id: 'user-1' }, { _id: 'user-2' }, { _id: 'user-3' }])
        // Second call: current FY users (only user-1 filed)
        .mockResolvedValueOnce([{ _id: 'user-1' }]);

      UserModel.find = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'user-2', firstName: 'Bob', lastName: 'Lost', createdAt: '2024-01-01' },
          { _id: 'user-3', firstName: 'Carol', lastName: 'Gone', createdAt: '2023-06-15' },
        ]),
      });

      const result = await getChurnRisk(
        TaxYearSummaryModel as unknown as Model<Document>,
        UserModel as unknown as Model<Document>,
        '2025-2026',
      );

      expect(result).toHaveLength(2);
      expect(result.some((r) => r.displayName === 'Bob Lost')).toBe(true);
      expect(result.some((r) => r.displayName === 'Carol Gone')).toBe(true);
    });

    it('computes previous FY correctly', async () => {
      const TaxYearSummaryModel = createMockModel();
      TaxYearSummaryModel.aggregate
        .mockResolvedValueOnce([]) // last FY
        .mockResolvedValueOnce([]); // current FY

      const UserModel = createMockModel();

      await getChurnRisk(
        TaxYearSummaryModel as unknown as Model<Document>,
        UserModel as unknown as Model<Document>,
        '2025-2026',
      );

      // First call should look for previousFY = '2024-2025'
      const firstCall = TaxYearSummaryModel.aggregate.mock.calls[0][0];
      expect(firstCall[0].$match.financialYear).toBe('2024-2025');
    });

    it('returns empty array when no one filed last FY', async () => {
      const TaxYearSummaryModel = createMockModel([]);
      const UserModel = createMockModel();

      const result = await getChurnRisk(
        TaxYearSummaryModel as unknown as Model<Document>,
        UserModel as unknown as Model<Document>,
        '2025-2026',
      );

      expect(result).toEqual([]);
    });

    it('returns empty array when all users renewed', async () => {
      const TaxYearSummaryModel = createMockModel();
      TaxYearSummaryModel.aggregate
        .mockResolvedValueOnce([{ _id: 'user-1' }])
        .mockResolvedValueOnce([{ _id: 'user-1' }]);

      const UserModel = createMockModel();

      const result = await getChurnRisk(
        TaxYearSummaryModel as unknown as Model<Document>,
        UserModel as unknown as Model<Document>,
        '2025-2026',
      );

      expect(result).toEqual([]);
    });
  });

  // ─── Service Mix Service ─────────────────────────────────────────────────

  describe('serviceMixService', () => {
    it('returns services sorted by revenue with percentage', async () => {
      const OrderModel = createMockModel([
        {
          serviceTitle: 'Individual Tax Return',
          orderCount: 50,
          quantity: 50,
          revenueCents: 2500000,
        },
        { serviceTitle: 'BAS Preparation', orderCount: 20, quantity: 25, revenueCents: 1000000 },
        { serviceTitle: 'SMSF Audit', orderCount: 5, quantity: 5, revenueCents: 500000 },
      ]);

      const result = await getServiceMix(OrderModel as unknown as Model<Document>, dateRange);

      expect(result).toHaveLength(3);
      expect(result[0].percentOfTotal).toBeCloseTo(62.5, 1);
      expect(result[1].percentOfTotal).toBeCloseTo(25, 1);
      expect(result[2].percentOfTotal).toBeCloseTo(12.5, 1);

      // Percentages should sum to 100
      const totalPct = result.reduce((s, r) => s + r.percentOfTotal, 0);
      expect(totalPct).toBeCloseTo(100, 0);
    });

    it('returns empty array for no orders', async () => {
      const OrderModel = createMockModel([]);
      const result = await getServiceMix(OrderModel as unknown as Model<Document>, dateRange);
      expect(result).toEqual([]);
    });

    it('handles single service (100%)', async () => {
      const OrderModel = createMockModel([
        { serviceTitle: 'Tax Return', orderCount: 10, quantity: 10, revenueCents: 500000 },
      ]);

      const result = await getServiceMix(OrderModel as unknown as Model<Document>, dateRange);
      expect(result).toHaveLength(1);
      expect(result[0].percentOfTotal).toBe(100);
    });
  });

  // ─── Seasonal Trends Service ─────────────────────────────────────────────

  describe('seasonalTrendsService', () => {
    it('returns current period data with YoY comparison', async () => {
      const OrderModel = createMockModel();
      const PaymentModel = createMockModel();

      // Current period orders
      OrderModel.aggregate
        .mockResolvedValueOnce([
          { _id: '2025-07', orderCount: 30 },
          { _id: '2025-08', orderCount: 45 },
        ])
        // Previous year orders
        .mockResolvedValueOnce([
          { _id: '2024-07', orderCount: 20 },
          { _id: '2024-08', orderCount: 35 },
        ]);

      // Current period revenue
      PaymentModel.aggregate
        .mockResolvedValueOnce([
          { _id: '2025-07', revenueCents: 300000 },
          { _id: '2025-08', revenueCents: 450000 },
        ])
        // Previous year revenue
        .mockResolvedValueOnce([
          { _id: '2024-07', revenueCents: 200000 },
          { _id: '2024-08', revenueCents: 350000 },
        ]);

      const result = await getSeasonalTrends(
        OrderModel as unknown as Model<Document>,
        PaymentModel as unknown as Model<Document>,
        dateRange,
        'month',
      );

      expect(result).toHaveLength(2);
      expect(result[0].period).toBe('2025-07');
      expect(result[0].orderCount).toBe(30);
      expect(result[0].revenueCents).toBe(300000);
      expect(result[0].previousYearOrderCount).toBe(20);
      expect(result[0].previousYearRevenueCents).toBe(200000);
    });

    it('uses REVENUE_PAYMENT_STATUSES for revenue queries', async () => {
      const OrderModel = createMockModel([]);
      const PaymentModel = createMockModel([]);
      OrderModel.aggregate.mockResolvedValue([]);
      PaymentModel.aggregate.mockResolvedValue([]);

      await getSeasonalTrends(
        OrderModel as unknown as Model<Document>,
        PaymentModel as unknown as Model<Document>,
        dateRange,
      );

      // Payment aggregations (2nd and 4th calls)
      const paymentPipeline = PaymentModel.aggregate.mock.calls[0][0];
      expect(paymentPipeline[0].$match.status.$in).toEqual([...REVENUE_PAYMENT_STATUSES]);
    });
  });

  // ─── Staff Benchmark Service ─────────────────────────────────────────────

  describe('staffBenchmarkService', () => {
    it('merges 4 parallel aggregations by staffId', async () => {
      const OrderModel = createMockModel([{ _id: 'staff-1', ordersCompleted: 15 }]);
      const LeadActivityModel = createMockModel([{ _id: 'staff-1', leadsContacted: 30 }]);
      const ReviewAssignmentModel = createMockModel([{ _id: 'staff-1', avgReviewMinutes: 45 }]);
      const SupportTicketModel = createMockModel([{ _id: 'staff-1', ticketsResolved: 20 }]);
      const UserModel = createMockModel();
      UserModel.find = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: 'staff-1', firstName: 'Jane', lastName: 'Doe' }]),
      });

      const result = await getStaffBenchmark(
        {
          OrderModel: OrderModel as unknown as Model<Document>,
          LeadActivityModel: LeadActivityModel as unknown as Model<Document>,
          ReviewAssignmentModel: ReviewAssignmentModel as unknown as Model<Document>,
          SupportTicketModel: SupportTicketModel as unknown as Model<Document>,
          UserModel: UserModel as unknown as Model<Document>,
        },
        dateRange,
      );

      expect(result).toHaveLength(1);
      expect(result[0].staffId).toBe('staff-1');
      expect(result[0].displayName).toBe('Jane Doe');
      expect(result[0].ordersCompleted).toBe(15);
      expect(result[0].leadsContacted).toBe(30);
      expect(result[0].avgReviewMinutes).toBe(45);
      expect(result[0].ticketsResolved).toBe(20);
    });

    it('merges data from different staff across sources', async () => {
      const OrderModel = createMockModel([{ _id: 'staff-1', ordersCompleted: 10 }]);
      const LeadActivityModel = createMockModel([{ _id: 'staff-2', leadsContacted: 25 }]);
      const ReviewAssignmentModel = createMockModel([]);
      const SupportTicketModel = createMockModel([]);
      const UserModel = createMockModel();
      UserModel.find = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'staff-1', firstName: 'A', lastName: 'One' },
          { _id: 'staff-2', firstName: 'B', lastName: 'Two' },
        ]),
      });

      const result = await getStaffBenchmark(
        {
          OrderModel: OrderModel as unknown as Model<Document>,
          LeadActivityModel: LeadActivityModel as unknown as Model<Document>,
          ReviewAssignmentModel: ReviewAssignmentModel as unknown as Model<Document>,
          SupportTicketModel: SupportTicketModel as unknown as Model<Document>,
          UserModel: UserModel as unknown as Model<Document>,
        },
        dateRange,
      );

      expect(result).toHaveLength(2);
      // Sorted by ordersCompleted desc
      expect(result[0].ordersCompleted).toBe(10);
      expect(result[0].leadsContacted).toBe(0); // staff-1 has no lead activity
      expect(result[1].ordersCompleted).toBe(0); // staff-2 has no orders
      expect(result[1].leadsContacted).toBe(25);
    });

    it('returns empty for no staff data', async () => {
      const empty = createMockModel([]);
      const UserModel = createMockModel();
      UserModel.find = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });

      const result = await getStaffBenchmark(
        {
          OrderModel: empty as unknown as Model<Document>,
          LeadActivityModel: empty as unknown as Model<Document>,
          ReviewAssignmentModel: empty as unknown as Model<Document>,
          SupportTicketModel: empty as unknown as Model<Document>,
          UserModel: UserModel as unknown as Model<Document>,
        },
        dateRange,
      );

      expect(result).toEqual([]);
    });
  });

  // ─── Channel ROI Service ─────────────────────────────────────────────────

  describe('channelRoiService', () => {
    it('computes ROI per channel', async () => {
      const CampaignModel = createMockModel([
        { _id: 'google_ads', campaignCount: 3, campaignIds: ['c1', 'c2', 'c3'], costCents: 200000 },
      ]);
      const LeadModel = createMockModel([
        { _id: 'c1', leadsGenerated: 20, convertedOrderIds: ['o1', 'o2'] },
        { _id: 'c2', leadsGenerated: 15, convertedOrderIds: ['o3'] },
      ]);
      const PaymentModel = createMockModel([
        { _id: 'o1', revenueCents: 150000 },
        { _id: 'o2', revenueCents: 100000 },
        { _id: 'o3', revenueCents: 200000 },
      ]);

      const result = await getChannelRoi(
        {
          CampaignModel: CampaignModel as unknown as Model<Document>,
          LeadModel: LeadModel as unknown as Model<Document>,
          PaymentModel: PaymentModel as unknown as Model<Document>,
        },
        dateRange,
      );

      expect(result).toHaveLength(1);
      expect(result[0].channel).toBe('google_ads');
      expect(result[0].leadsGenerated).toBe(35);
      expect(result[0].conversions).toBe(3);
      expect(result[0].revenueCents).toBe(450000);
      expect(result[0].costCents).toBe(200000);
      // ROI = (450000 - 200000) / 200000 = 1.25
      expect(result[0].roi).toBe(1.25);
    });

    it('returns empty for no campaigns', async () => {
      const empty = createMockModel([]);

      const result = await getChannelRoi(
        {
          CampaignModel: empty as unknown as Model<Document>,
          LeadModel: empty as unknown as Model<Document>,
          PaymentModel: empty as unknown as Model<Document>,
        },
        dateRange,
      );

      expect(result).toEqual([]);
    });

    it('filters by REVENUE_PAYMENT_STATUSES for payment revenue', async () => {
      const CampaignModel = createMockModel([
        { _id: 'seo', campaignCount: 1, campaignIds: ['c1'], costCents: 50000 },
      ]);
      const LeadModel = createMockModel([
        { _id: 'c1', leadsGenerated: 5, convertedOrderIds: ['o1'] },
      ]);
      const PaymentModel = createMockModel([]);

      await getChannelRoi(
        {
          CampaignModel: CampaignModel as unknown as Model<Document>,
          LeadModel: LeadModel as unknown as Model<Document>,
          PaymentModel: PaymentModel as unknown as Model<Document>,
        },
        dateRange,
      );

      const paymentPipeline = PaymentModel.aggregate.mock.calls[0][0];
      expect(paymentPipeline[0].$match.status.$in).toEqual([...REVENUE_PAYMENT_STATUSES]);
    });

    it('filters by specific channels when provided', async () => {
      const CampaignModel = createMockModel([]);
      const LeadModel = createMockModel([]);
      const PaymentModel = createMockModel([]);

      await getChannelRoi(
        {
          CampaignModel: CampaignModel as unknown as Model<Document>,
          LeadModel: LeadModel as unknown as Model<Document>,
          PaymentModel: PaymentModel as unknown as Model<Document>,
        },
        dateRange,
        ['google_ads', 'facebook'],
      );

      const campaignPipeline = CampaignModel.aggregate.mock.calls[0][0];
      expect(campaignPipeline[0].$match.channel.$in).toEqual(['google_ads', 'facebook']);
    });
  });

  // ─── Export Service ──────────────────────────────────────────────────────

  describe('exportService', () => {
    it('enqueues job and returns jobId', async () => {
      const queue = { add: jest.fn().mockResolvedValue({}) };

      const result = await createExportJob(queue, {
        format: 'xlsx',
        widgets: ['revenue-forecast', 'clv'],
        dateFrom: '2025-01-01',
        dateTo: '2025-12-31',
        requestedBy: 'user-001',
      });

      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('queued');
      expect(result.format).toBe('xlsx');
      expect(result.widgets).toEqual(['revenue-forecast', 'clv']);

      expect(queue.add).toHaveBeenCalledWith(
        'analytics-export',
        expect.objectContaining({
          jobId: result.jobId,
          format: 'xlsx',
          requestedBy: 'user-001',
        }),
      );
    });

    it('supports pdf format', async () => {
      const queue = { add: jest.fn().mockResolvedValue({}) };

      const result = await createExportJob(queue, {
        format: 'pdf',
        widgets: ['pipeline-health'],
        requestedBy: 'user-002',
      });

      expect(result.format).toBe('pdf');
    });

    it('generates unique jobIds', async () => {
      const queue = { add: jest.fn().mockResolvedValue({}) };
      const params = { format: 'xlsx' as const, widgets: [] as [], requestedBy: 'u' };

      const r1 = await createExportJob(queue, params);
      const r2 = await createExportJob(queue, params);

      expect(r1.jobId).not.toBe(r2.jobId);
    });
  });

  // ─── Cache Service ───────────────────────────────────────────────────────

  describe('cacheService', () => {
    describe('buildCacheKey', () => {
      it('is deterministic for same inputs', () => {
        const k1 = buildCacheKey('test', { a: 1, b: 2 });
        const k2 = buildCacheKey('test', { a: 1, b: 2 });
        expect(k1).toBe(k2);
      });

      it('is order-independent for params', () => {
        const k1 = buildCacheKey('v', { a: 1, b: 2 });
        const k2 = buildCacheKey('v', { b: 2, a: 1 });
        expect(k1).toBe(k2);
      });

      it('different views produce different keys', () => {
        const k1 = buildCacheKey('revenue', { a: 1 });
        const k2 = buildCacheKey('clv', { a: 1 });
        expect(k1).not.toBe(k2);
      });
    });

    describe('withCache', () => {
      it('returns computed result when redis is null', async () => {
        const fn = jest.fn().mockResolvedValue({ total: 42 });
        const result = await withCache(null, 'key', 300, fn);

        expect(result).toEqual({ total: 42 });
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('returns cached result on hit', async () => {
        const redis = createMockRedis();
        redis.get.mockResolvedValue(JSON.stringify({ cached: true }));

        const fn = jest.fn();
        const result = await withCache(redis as never, 'key', 300, fn);

        expect(result).toEqual({ cached: true });
        // computeFn should NOT be called on cache hit (unless stale-while-revalidate triggers)
      });

      it('computes and stores on cache miss', async () => {
        const redis = createMockRedis();
        redis.get.mockResolvedValue(null);

        const fn = jest.fn().mockResolvedValue({ fresh: true });
        const result = await withCache(redis as never, 'key', 300, fn);

        expect(result).toEqual({ fresh: true });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(redis.set).toHaveBeenCalledWith('key', JSON.stringify({ fresh: true }), 'EX', 300);
      });
    });

    describe('getCached / setCache', () => {
      it('round-trips data through Redis', async () => {
        const redis = createMockRedis();
        redis.get.mockResolvedValue(null);

        // setCache
        await setCache(redis as never, 'test-key', 60, { hello: 'world' });
        expect(redis.set).toHaveBeenCalledWith('test-key', '{"hello":"world"}', 'EX', 60);

        // getCached
        redis.get.mockResolvedValue('{"hello":"world"}');
        const result = await getCached(redis as never, 'test-key');
        expect(result).toEqual({ hello: 'world' });
      });

      it('getCached returns null for missing key', async () => {
        const redis = createMockRedis();
        redis.get.mockResolvedValue(null);
        const result = await getCached(redis as never, 'missing');
        expect(result).toBeNull();
      });

      it('getCached returns null for invalid JSON', async () => {
        const redis = createMockRedis();
        redis.get.mockResolvedValue('not-json{{');
        const result = await getCached(redis as never, 'bad');
        expect(result).toBeNull();
      });
    });
  });
});
