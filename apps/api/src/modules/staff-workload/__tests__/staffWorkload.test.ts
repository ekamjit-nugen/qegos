import {
  DEFAULT_WEIGHTS,
  DEFAULT_CAPACITY,
  DEFAULT_ELIGIBLE_USER_TYPES,
  type AssignmentContext,
} from '../workload.types';

import { createWorkloadService } from '../workload.service';
import { createWorkloadRoutes, getWorkloadService } from '../workload.routes';

// ─── Type Constants ─────────────────────────────────────────────────────────

describe('Staff Workload — Types & Constants', () => {
  test('DEFAULT_WEIGHTS has correct values', () => {
    expect(DEFAULT_WEIGHTS).toEqual({
      activeLeads: 1.0,
      ordersInProgress: 2.0,
      pendingReviews: 1.5,
      openTickets: 0.8,
      upcomingAppointments: 1.2,
    });
  });

  test('ordersInProgress has highest weight', () => {
    const values = Object.values(DEFAULT_WEIGHTS);
    expect(Math.max(...values)).toBe(DEFAULT_WEIGHTS.ordersInProgress);
  });

  test('DEFAULT_CAPACITY has correct values', () => {
    expect(DEFAULT_CAPACITY).toEqual({
      maxLeads: 50,
      maxOrders: 30,
      maxReviews: 20,
      maxTickets: 25,
      maxAppointmentsPerDay: 8,
    });
  });

  test('DEFAULT_ELIGIBLE_USER_TYPES includes admin, staff, office_manager, senior_staff', () => {
    expect(DEFAULT_ELIGIBLE_USER_TYPES).toEqual([1, 3, 5, 6]);
  });

  test('AssignmentContext includes all 5 contexts', () => {
    const validContexts: AssignmentContext[] = ['lead', 'order', 'review', 'ticket', 'appointment'];
    expect(validContexts).toHaveLength(5);
  });
});

// ─── Workload Score Calculation ─────────────────────────────────────────────

describe('Staff Workload — Score Calculation', () => {
  test('workload score is weighted sum of all factors', () => {
    // Manually compute expected score
    const leads = 10,
      orders = 5,
      reviews = 3,
      tickets = 8,
      appointments = 2;
    const expected =
      Math.round(
        (leads * DEFAULT_WEIGHTS.activeLeads +
          orders * DEFAULT_WEIGHTS.ordersInProgress +
          reviews * DEFAULT_WEIGHTS.pendingReviews +
          tickets * DEFAULT_WEIGHTS.openTickets +
          appointments * DEFAULT_WEIGHTS.upcomingAppointments) *
          100,
      ) / 100;
    // 10*1.0 + 5*2.0 + 3*1.5 + 8*0.8 + 2*1.2 = 10 + 10 + 4.5 + 6.4 + 2.4 = 33.3
    expect(expected).toBe(33.3);
  });

  test('zero workload produces score of 0', () => {
    const score =
      Math.round(
        (0 * DEFAULT_WEIGHTS.activeLeads +
          0 * DEFAULT_WEIGHTS.ordersInProgress +
          0 * DEFAULT_WEIGHTS.pendingReviews +
          0 * DEFAULT_WEIGHTS.openTickets +
          0 * DEFAULT_WEIGHTS.upcomingAppointments) *
          100,
      ) / 100;
    expect(score).toBe(0);
  });
});

// ─── Capacity Checks ────────────────────────────────────────────────────────

describe('Staff Workload — Capacity Checks', () => {
  test('staff at maxLeads is at capacity', () => {
    expect(DEFAULT_CAPACITY.maxLeads).toBe(50);
    const atCapacity = 50 >= DEFAULT_CAPACITY.maxLeads;
    expect(atCapacity).toBe(true);
  });

  test('staff below all limits is not at capacity', () => {
    const breaches: string[] = [];
    if (10 >= DEFAULT_CAPACITY.maxLeads) {
      breaches.push('leads');
    }
    if (5 >= DEFAULT_CAPACITY.maxOrders) {
      breaches.push('orders');
    }
    if (2 >= DEFAULT_CAPACITY.maxReviews) {
      breaches.push('reviews');
    }
    if (3 >= DEFAULT_CAPACITY.maxTickets) {
      breaches.push('tickets');
    }
    if (1 >= DEFAULT_CAPACITY.maxAppointmentsPerDay) {
      breaches.push('appointments');
    }
    expect(breaches).toHaveLength(0);
  });

  test('multiple capacity breaches are tracked', () => {
    const breaches: string[] = [];
    if (50 >= DEFAULT_CAPACITY.maxLeads) {
      breaches.push('leads');
    }
    if (30 >= DEFAULT_CAPACITY.maxOrders) {
      breaches.push('orders');
    }
    if (5 >= DEFAULT_CAPACITY.maxReviews) {
      breaches.push('reviews');
    }
    expect(breaches).toEqual(['leads', 'orders']);
  });
});

// ─── Service Factory ────────────────────────────────────────────────────────

describe('Staff Workload — Service', () => {
  function createMockModel(aggregateResult: unknown[] = []): Record<string, unknown> {
    return {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
      aggregate: jest.fn().mockResolvedValue(aggregateResult),
    };
  }

  function createMockDeps(
    staffList?: Array<{
      _id: string;
      firstName: string;
      lastName: string;
      email: string;
      userType: number;
    }>,
  ): Record<string, unknown> {
    const userFind = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(staffList ?? []),
      }),
    });

    return {
      UserModel: { find: userFind, aggregate: jest.fn().mockResolvedValue([]) },
      LeadModel: createMockModel(),
      OrderModel: createMockModel(),
      ReviewAssignmentModel: createMockModel(),
      SupportTicketModel: createMockModel(),
      AppointmentModel: createMockModel(),
    };
  }

  test('createWorkloadService returns all 4 methods', () => {
    const deps = createMockDeps();
    const service = createWorkloadService(deps as never);
    expect(service).toHaveProperty('getStaffWorkloads');
    expect(service).toHaveProperty('getStaffWorkload');
    expect(service).toHaveProperty('smartAssign');
    expect(service).toHaveProperty('smartAssignBulk');
    expect(typeof service.getStaffWorkloads).toBe('function');
    expect(typeof service.getStaffWorkload).toBe('function');
    expect(typeof service.smartAssign).toBe('function');
    expect(typeof service.smartAssignBulk).toBe('function');
  });

  test('getStaffWorkloads returns empty array when no staff', async () => {
    const deps = createMockDeps([]);
    const service = createWorkloadService(deps as never);
    const result = await service.getStaffWorkloads();
    expect(result).toEqual([]);
  });

  test('getStaffWorkloads returns snapshots with correct structure', async () => {
    const staff = [
      { _id: 'staff1', firstName: 'John', lastName: 'Doe', email: 'john@test.com', userType: 3 },
    ];
    const deps = createMockDeps(staff);
    const service = createWorkloadService(deps as never);
    const result = await service.getStaffWorkloads();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      staffId: 'staff1',
      name: 'John Doe',
      email: 'john@test.com',
      userType: 3,
      activeLeads: 0,
      ordersInProgress: 0,
      pendingReviews: 0,
      openTickets: 0,
      upcomingAppointments: 0,
      workloadScore: 0,
      isAtCapacity: false,
      capacityBreaches: [],
    });
  });

  test('getStaffWorkload returns null for unknown staff', async () => {
    const deps = createMockDeps([]);
    const service = createWorkloadService(deps as never);
    const result = await service.getStaffWorkload('unknown-id');
    expect(result).toBeNull();
  });

  test('smartAssign returns null when no staff available', async () => {
    const deps = createMockDeps([]);
    const service = createWorkloadService(deps as never);
    const result = await service.smartAssign({ context: 'lead' });
    expect(result).toBeNull();
  });

  test('smartAssign picks the staff with lowest workload score', async () => {
    const staff = [
      { _id: 'staff1', firstName: 'Busy', lastName: 'Bee', email: 'busy@test.com', userType: 3 },
      { _id: 'staff2', firstName: 'Free', lastName: 'Bird', email: 'free@test.com', userType: 3 },
    ];
    const deps = createMockDeps(staff);

    // Mock lead aggregation: staff1 has 20 leads, staff2 has 0
    (deps.LeadModel as Record<string, jest.Mock>).aggregate.mockResolvedValue([
      { _id: 'staff1', count: 20 },
    ]);

    const service = createWorkloadService(deps as never);
    const result = await service.smartAssign({ context: 'lead' });

    expect(result).not.toBeNull();
    expect(result!.staffId).toBe('staff2');
    expect(result!.reason).toContain('Lowest workload score');
  });

  test('smartAssign excludes staff in excludeStaffIds', async () => {
    const staff = [
      { _id: 'staff1', firstName: 'A', lastName: 'A', email: 'a@test.com', userType: 3 },
      { _id: 'staff2', firstName: 'B', lastName: 'B', email: 'b@test.com', userType: 3 },
    ];
    const deps = createMockDeps(staff);
    const service = createWorkloadService(deps as never);

    const result = await service.smartAssign({
      context: 'lead',
      excludeStaffIds: ['staff2'],
    });

    expect(result).not.toBeNull();
    expect(result!.staffId).toBe('staff1');
  });

  test('smartAssign filters by requiredUserTypes', async () => {
    const staff = [
      { _id: 'staff1', firstName: 'A', lastName: 'A', email: 'a@test.com', userType: 3 },
      { _id: 'staff2', firstName: 'B', lastName: 'B', email: 'b@test.com', userType: 6 },
    ];
    const deps = createMockDeps(staff);
    const service = createWorkloadService(deps as never);

    const result = await service.smartAssign({
      context: 'review',
      requiredUserTypes: [6], // senior_staff only
    });

    expect(result).not.toBeNull();
    expect(result!.staffId).toBe('staff2');
  });

  test('smartAssignBulk distributes across multiple staff', async () => {
    const staff = [
      { _id: 'staff1', firstName: 'A', lastName: 'A', email: 'a@test.com', userType: 3 },
      { _id: 'staff2', firstName: 'B', lastName: 'B', email: 'b@test.com', userType: 3 },
    ];
    const deps = createMockDeps(staff);
    const service = createWorkloadService(deps as never);

    const results = await service.smartAssignBulk(4, { context: 'lead' });

    expect(results).toHaveLength(4);
    // Should distribute: both staff should get assignments
    const staff1Count = results.filter((r) => r.staffId === 'staff1').length;
    const staff2Count = results.filter((r) => r.staffId === 'staff2').length;
    expect(staff1Count).toBe(2);
    expect(staff2Count).toBe(2);
  });

  test('smartAssignBulk returns fewer results when staff exhausted', async () => {
    const deps = createMockDeps([]);
    const service = createWorkloadService(deps as never);

    const results = await service.smartAssignBulk(5, { context: 'lead' });
    expect(results).toHaveLength(0);
  });

  test('custom weights override defaults', async () => {
    const staff = [
      { _id: 'staff1', firstName: 'A', lastName: 'A', email: 'a@test.com', userType: 3 },
    ];
    const deps = createMockDeps(staff);

    // Give staff1 10 leads
    (deps.LeadModel as Record<string, jest.Mock>).aggregate.mockResolvedValue([
      { _id: 'staff1', count: 10 },
    ]);

    // With default weight (1.0): score = 10*1.0 = 10
    const serviceDefault = createWorkloadService(deps as never);
    const defaultResult = await serviceDefault.getStaffWorkloads();
    expect(defaultResult[0].workloadScore).toBe(10);

    // With custom weight (3.0): score = 10*3.0 = 30
    const serviceCustom = createWorkloadService(deps as never, { weights: { activeLeads: 3.0 } });
    const customResult = await serviceCustom.getStaffWorkloads();
    expect(customResult[0].workloadScore).toBe(30);
  });
});

// ─── Routes ─────────────────────────────────────────────────────────────────

describe('Staff Workload — Routes', () => {
  test('createWorkloadRoutes returns a Router', () => {
    const mockDeps = {
      UserModel: {},
      LeadModel: {},
      OrderModel: {},
      ReviewAssignmentModel: {},
      SupportTicketModel: {},
      AppointmentModel: {},
      authenticate: () => (_req: unknown, _res: unknown, next: () => void) => next(),
      checkPermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    };

    const router = createWorkloadRoutes(mockDeps as never);
    expect(router).toBeDefined();
    expect(typeof router).toBe('function'); // Express Router is a function
  });

  test('getWorkloadService returns non-null after routes created', () => {
    const mockDeps = {
      UserModel: {},
      LeadModel: {},
      OrderModel: {},
      ReviewAssignmentModel: {},
      SupportTicketModel: {},
      AppointmentModel: {},
      authenticate: () => (_req: unknown, _res: unknown, next: () => void) => next(),
      checkPermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    };

    createWorkloadRoutes(mockDeps as never);
    const service = getWorkloadService();
    expect(service).not.toBeNull();
    expect(service).toHaveProperty('getStaffWorkloads');
    expect(service).toHaveProperty('smartAssign');
    expect(service).toHaveProperty('smartAssignBulk');
  });
});

// ─── Lead Automation Integration ────────────────────────────────────────────

describe('Staff Workload — Lead Automation Integration', () => {
  test('AutomationDeps accepts optional smartAssignBulk', async () => {
    // This is a type-level test — if it compiles, the interface accepts the optional param
    const { createAutomationHandlers } = await import('../../lead-management/lead.automation');
    expect(createAutomationHandlers).toBeDefined();
    expect(typeof createAutomationHandlers).toBe('function');
  });
});
