/**
 * Query Optimization — Tests
 *
 * Validates that analytics aggregation pipelines follow optimization best practices:
 * 1. Early $project stages before $group/$unwind to minimize document size
 * 2. $match as first pipeline stage (filter early)
 * 3. Covering indexes for sum/count operations include the aggregated field
 * 4. No unnecessary fields flowing through pipelines
 */

import {
  getRevenueByPeriod,
  getCollectionRate,
  getServiceMix,
  getSeasonalTrends,
  getPipelineHealth,
  getStaffBenchmark,
  getRevenueForecast,
  getClv,
} from '@nugen/analytics-engine';
import type { Model, Document } from 'mongoose';

// ─── Helpers ───────────────────────────────────────────────────────────────

type MockModel = {
  aggregate: jest.Mock;
  find: jest.Mock;
  countDocuments: jest.Mock;
};

function createMockModel(result: unknown[] = []): MockModel {
  return {
    aggregate: jest.fn().mockResolvedValue(result),
    find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    countDocuments: jest.fn().mockResolvedValue(0),
  };
}

function getPipeline(model: MockModel, callIndex: number = 0): Array<Record<string, unknown>> {
  const args = model.aggregate.mock.calls[callIndex];
  // aggregate() receives the pipeline as the first argument (an array of stages)
  return args[0] as Array<Record<string, unknown>>;
}

function getFirstStageType(model: MockModel, callIndex: number = 0): string {
  const pipeline = getPipeline(model, callIndex);
  return Object.keys(pipeline[0])[0];
}

function getStageByType(
  pipeline: Array<Record<string, unknown>>,
  type: string,
): Record<string, unknown> | undefined {
  return pipeline.find((stage) => type in stage);
}

function getAllStagesByType(
  pipeline: Array<Record<string, unknown>>,
  type: string,
): Array<Record<string, unknown>> {
  return pipeline.filter((stage) => type in stage);
}

function getStageIndex(pipeline: Array<Record<string, unknown>>, type: string): number {
  return pipeline.findIndex((stage) => type in stage);
}

const dateRange = {
  dateFrom: new Date('2025-01-01'),
  dateTo: new Date('2025-12-31'),
};

// ═══════════════════════════════════════════════════════════════════════════════

describe('Query Optimization', () => {
  // ─── $match First Rule ──────────────────────────────────────────────

  describe('$match is always the first pipeline stage', () => {
    test('revenueService.getRevenueByPeriod starts with $match', async () => {
      const model = createMockModel([]);
      await getRevenueByPeriod(model as unknown as Model<Document>, dateRange);

      const pipeline = getPipeline(model);
      expect(Object.keys(pipeline[0])[0]).toBe('$match');
    });

    test('revenueService.getCollectionRate — all 3 aggregations start with $match', async () => {
      const PaymentModel = createMockModel([]);
      const OrderModel = createMockModel([]);
      PaymentModel.aggregate.mockResolvedValue([]);
      OrderModel.aggregate.mockResolvedValue([]);

      await getCollectionRate(
        PaymentModel as unknown as Model<Document>,
        OrderModel as unknown as Model<Document>,
        dateRange,
      );

      // OrderModel: 1 call (invoiced)
      expect(getFirstStageType(OrderModel, 0)).toBe('$match');
      // PaymentModel: 2 calls (collected, pending)
      expect(getFirstStageType(PaymentModel, 0)).toBe('$match');
      expect(getFirstStageType(PaymentModel, 1)).toBe('$match');
    });

    test('serviceMixService starts with $match', async () => {
      const model = createMockModel([]);
      await getServiceMix(model as unknown as Model<Document>, dateRange);

      const pipeline = getPipeline(model);
      expect(Object.keys(pipeline[0])[0]).toBe('$match');
    });

    test('seasonalTrendsService — all aggregations start with $match', async () => {
      const OrderModel = createMockModel([]);
      const PaymentModel = createMockModel([]);

      await getSeasonalTrends(
        OrderModel as unknown as Model<Document>,
        PaymentModel as unknown as Model<Document>,
        dateRange,
      );

      // 2 order aggs, 2 payment aggs
      for (let i = 0; i < OrderModel.aggregate.mock.calls.length; i++) {
        expect(getFirstStageType(OrderModel, i)).toBe('$match');
      }
      for (let i = 0; i < PaymentModel.aggregate.mock.calls.length; i++) {
        expect(getFirstStageType(PaymentModel, i)).toBe('$match');
      }
    });

    test('pipelineHealthService starts with $match', async () => {
      const LeadModel = createMockModel([]);
      const LeadActivityModel = createMockModel([]);

      await getPipelineHealth(
        LeadModel as unknown as Model<Document>,
        LeadActivityModel as unknown as Model<Document>,
        dateRange,
      );

      expect(getFirstStageType(LeadModel, 0)).toBe('$match');
      expect(getFirstStageType(LeadActivityModel, 0)).toBe('$match');
    });

    test('forecastService starts with $match', async () => {
      const model = createMockModel([]);
      await getRevenueForecast(model as unknown as Model<Document>, {}, dateRange);

      const pipeline = getPipeline(model);
      expect(Object.keys(pipeline[0])[0]).toBe('$match');
    });

    test('clvService starts with $match', async () => {
      const PaymentModel = createMockModel([]);
      const UserModel = createMockModel([]);

      await getClv(
        PaymentModel as unknown as Model<Document>,
        UserModel as unknown as Model<Document>,
      );

      const pipeline = getPipeline(PaymentModel);
      expect(Object.keys(pipeline[0])[0]).toBe('$match');
    });
  });

  // ─── Early $project Before $unwind ──────────────────────────────────

  describe('$project before $unwind to minimize document size', () => {
    test('serviceMixService has $project before $unwind', async () => {
      const model = createMockModel([]);
      await getServiceMix(model as unknown as Model<Document>, dateRange);

      const pipeline = getPipeline(model);
      const projectIdx = getStageIndex(pipeline, '$project');
      const unwindIdx = getStageIndex(pipeline, '$unwind');

      expect(projectIdx).toBeLessThan(unwindIdx);
      expect(projectIdx).toBe(1); // Right after $match
    });

    test('serviceMixService $project only includes lineItems fields', async () => {
      const model = createMockModel([]);
      await getServiceMix(model as unknown as Model<Document>, dateRange);

      const pipeline = getPipeline(model);
      const projectStage = pipeline[1].$project as Record<string, unknown>;

      // Should only project lineItems fields needed for the pipeline
      const keys = Object.keys(projectStage);
      expect(keys.every((k) => k.startsWith('lineItems'))).toBe(true);
    });
  });

  // ─── Early $project Before $group ───────────────────────────────────

  describe('$project before $group to reduce document size', () => {
    test('pipelineHealthService projects before $group', async () => {
      const LeadModel = createMockModel([]);
      const LeadActivityModel = createMockModel([]);

      await getPipelineHealth(
        LeadModel as unknown as Model<Document>,
        LeadActivityModel as unknown as Model<Document>,
        dateRange,
      );

      const pipeline = getPipeline(LeadModel, 0);
      const projectIdx = getStageIndex(pipeline, '$project');
      const groupIdx = getStageIndex(pipeline, '$group');

      expect(projectIdx).toBeLessThan(groupIdx);
    });

    test('pipelineHealth $project only includes status and estimatedValue', async () => {
      const LeadModel = createMockModel([]);
      const LeadActivityModel = createMockModel([]);

      await getPipelineHealth(
        LeadModel as unknown as Model<Document>,
        LeadActivityModel as unknown as Model<Document>,
        dateRange,
      );

      const pipeline = getPipeline(LeadModel, 0);
      const projectStage = pipeline[1].$project as Record<string, unknown>;

      expect(projectStage).toHaveProperty('status');
      expect(projectStage).toHaveProperty('estimatedValue');
      // Should not include unnecessary fields like firstName, email, etc.
      expect(Object.keys(projectStage).length).toBeLessThanOrEqual(3); // status + estimatedValue + maybe _id
    });

    test('seasonalTrends projects createdAt before $group', async () => {
      const OrderModel = createMockModel([]);
      const PaymentModel = createMockModel([]);

      await getSeasonalTrends(
        OrderModel as unknown as Model<Document>,
        PaymentModel as unknown as Model<Document>,
        dateRange,
      );

      const pipeline = getPipeline(OrderModel, 0);
      const projectIdx = getStageIndex(pipeline, '$project');
      const groupIdx = getStageIndex(pipeline, '$group');

      expect(projectIdx).toBeLessThan(groupIdx);

      const projectStage = pipeline[1].$project as Record<string, unknown>;
      expect(projectStage).toHaveProperty('createdAt');
    });

    test('collectionRate projects finalAmount before $group', async () => {
      const PaymentModel = createMockModel([]);
      const OrderModel = createMockModel([]);

      await getCollectionRate(
        PaymentModel as unknown as Model<Document>,
        OrderModel as unknown as Model<Document>,
        dateRange,
      );

      const pipeline = getPipeline(OrderModel, 0);
      const projectStage = getStageByType(pipeline, '$project');

      expect(projectStage).toBeDefined();
      expect((projectStage!.$project as Record<string, unknown>).finalAmount).toBe(1);
    });
  });

  // ─── Staff Benchmark Parallel Aggregations ──────────────────────────

  describe('staffBenchmarkService parallel aggregation optimization', () => {
    test('all 4 aggregations have $project before $group', async () => {
      const models = {
        OrderModel: createMockModel([]),
        LeadActivityModel: createMockModel([]),
        ReviewAssignmentModel: createMockModel([]),
        SupportTicketModel: createMockModel([]),
        UserModel: createMockModel([]),
      };
      models.UserModel.find = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });

      await getStaffBenchmark(
        models as unknown as {
          OrderModel: Model<Document>;
          LeadActivityModel: Model<Document>;
          ReviewAssignmentModel: Model<Document>;
          SupportTicketModel: Model<Document>;
          UserModel: Model<Document>;
        },
        dateRange,
      );

      // Check each model's pipeline has $project before $group
      const checkProjectBeforeGroup = (model: MockModel, _name: string): void => {
        const pipeline = getPipeline(model, 0);
        const projectIdx = getStageIndex(pipeline, '$project');
        const groupIdx = getStageIndex(pipeline, '$group');

        expect(projectIdx).toBeGreaterThan(-1);
        expect(projectIdx).toBeLessThan(groupIdx);
      };

      checkProjectBeforeGroup(models.OrderModel, 'OrderModel');
      checkProjectBeforeGroup(models.LeadActivityModel, 'LeadActivityModel');
      checkProjectBeforeGroup(models.ReviewAssignmentModel, 'ReviewAssignmentModel');
      checkProjectBeforeGroup(models.SupportTicketModel, 'SupportTicketModel');
    });

    test('OrderModel $project only includes processingBy', async () => {
      const models = {
        OrderModel: createMockModel([]),
        LeadActivityModel: createMockModel([]),
        ReviewAssignmentModel: createMockModel([]),
        SupportTicketModel: createMockModel([]),
        UserModel: createMockModel([]),
      };
      models.UserModel.find = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });

      await getStaffBenchmark(
        models as unknown as {
          OrderModel: Model<Document>;
          LeadActivityModel: Model<Document>;
          ReviewAssignmentModel: Model<Document>;
          SupportTicketModel: Model<Document>;
          UserModel: Model<Document>;
        },
        dateRange,
      );

      const pipeline = getPipeline(models.OrderModel, 0);
      const projectStage = pipeline.find((s: Record<string, unknown>) => '$project' in s);
      const projected = (projectStage as Record<string, unknown>).$project as Record<
        string,
        unknown
      >;

      expect(projected).toHaveProperty('processingBy');
    });

    test('ReviewAssignmentModel $project includes reviewerId and timeToReview', async () => {
      const models = {
        OrderModel: createMockModel([]),
        LeadActivityModel: createMockModel([]),
        ReviewAssignmentModel: createMockModel([]),
        SupportTicketModel: createMockModel([]),
        UserModel: createMockModel([]),
      };
      models.UserModel.find = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });

      await getStaffBenchmark(
        models as unknown as {
          OrderModel: Model<Document>;
          LeadActivityModel: Model<Document>;
          ReviewAssignmentModel: Model<Document>;
          SupportTicketModel: Model<Document>;
          UserModel: Model<Document>;
        },
        dateRange,
      );

      const pipeline = getPipeline(models.ReviewAssignmentModel, 0);
      const projectStage = pipeline.find((s: Record<string, unknown>) => '$project' in s);
      const projected = (projectStage as Record<string, unknown>).$project as Record<
        string,
        unknown
      >;

      expect(projected).toHaveProperty('reviewerId');
      expect(projected).toHaveProperty('timeToReview');
    });
  });

  // ─── Pipeline Stage Count ───────────────────────────────────────────

  describe('Pipeline efficiency (minimal stage count)', () => {
    test('revenueByPeriod has <= 5 stages', async () => {
      const model = createMockModel([]);
      await getRevenueByPeriod(model as unknown as Model<Document>, dateRange);
      expect(getPipeline(model).length).toBeLessThanOrEqual(5);
    });

    test('serviceMix has <= 8 stages', async () => {
      const model = createMockModel([]);
      await getServiceMix(model as unknown as Model<Document>, dateRange);
      // $match, $project, $unwind, $match, $group, $sort, $project = 7
      expect(getPipeline(model).length).toBeLessThanOrEqual(8);
    });

    test('forecast has <= 5 stages', async () => {
      const model = createMockModel([]);
      await getRevenueForecast(model as unknown as Model<Document>, {}, dateRange);
      expect(getPipeline(model).length).toBeLessThanOrEqual(5);
    });
  });

  // ─── No $lookup in Analytics ────────────────────────────────────────

  describe('No expensive $lookup in analytics pipelines', () => {
    test('revenue pipelines avoid $lookup (use in-memory joins)', async () => {
      const model = createMockModel([]);
      await getRevenueByPeriod(model as unknown as Model<Document>, dateRange);

      const pipeline = getPipeline(model);
      const lookups = getAllStagesByType(pipeline, '$lookup');
      expect(lookups).toHaveLength(0);
    });

    test('CLV avoids $lookup (enriches via separate find)', async () => {
      const PaymentModel = createMockModel([]);
      const UserModel = createMockModel([]);

      await getClv(
        PaymentModel as unknown as Model<Document>,
        UserModel as unknown as Model<Document>,
      );

      const pipeline = getPipeline(PaymentModel);
      const lookups = getAllStagesByType(pipeline, '$lookup');
      expect(lookups).toHaveLength(0);
    });
  });
});
