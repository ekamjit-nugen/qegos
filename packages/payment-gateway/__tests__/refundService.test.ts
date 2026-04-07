import {
  initRefundService,
  processRefund,
  getRequiredApprovalLevel,
  hasApprovalAuthority,
} from '../src/services/refundService';
import { initWebhookProcessor } from '../src/services/webhookProcessor';
import type {
  IPaymentProvider,
  PaymentGateway,
} from '../src/types';

// ─── Mock Provider ───────────────────────────────────────────────────────────

const mockRefundResult = {
  gatewayRefundId: 're_test_123',
  amount: 5000,
  status: 'succeeded',
};

const mockProvider: IPaymentProvider = {
  name: 'stripe',
  createPaymentIntent: jest.fn(),
  capturePayment: jest.fn(),
  refundPayment: jest.fn().mockResolvedValue(mockRefundResult),
  getPaymentStatus: jest.fn(),
  testConnection: jest.fn(),
};

// ─── Mock Payment Model ──────────────────────────────────────────────────────

function createMockPayment(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    orderId: { toString: () => '507f1f77bcf86cd799439012' },
    userId: { toString: () => '507f1f77bcf86cd799439013' },
    paymentNumber: 'QGS-PAY-0001',
    gateway: 'stripe',
    gatewayTxnId: 'pi_test_123',
    amount: 16500,
    capturedAmount: 16500,
    refundedAmount: 0,
    status: 'succeeded',
    refunds: [],
    save: jest.fn().mockImplementation(async function (this: Record<string, unknown>) {
      return this;
    }),
    ...overrides,
  };
}

let currentMockPayment: Record<string, unknown> | null = null;

const MockPaymentModel = {
  findById: jest.fn(async () => currentMockPayment),
};

const MockWebhookEventModel = {
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockImplementation(async (data: Record<string, unknown>) => ({
    ...data,
    save: jest.fn(),
  })),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RefundService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentMockPayment = createMockPayment();
    const providers = new Map<PaymentGateway, IPaymentProvider>();
    providers.set('stripe', mockProvider);
    initRefundService(MockPaymentModel as never, providers);
    initWebhookProcessor(MockWebhookEventModel as never, MockPaymentModel as never);
  });

  describe('getRequiredApprovalLevel', () => {
    it('should return "none" for amounts <= $500 (50000 cents)', () => {
      expect(getRequiredApprovalLevel(50000)).toBe('none');
      expect(getRequiredApprovalLevel(10000)).toBe('none');
    });

    it('should return "admin" for amounts > $500 and <= $2000 (BIL-INV-04)', () => {
      expect(getRequiredApprovalLevel(50001)).toBe('admin');
      expect(getRequiredApprovalLevel(100000)).toBe('admin');
      expect(getRequiredApprovalLevel(200000)).toBe('admin');
    });

    it('should return "super_admin" for amounts > $2000 (BIL-INV-04)', () => {
      expect(getRequiredApprovalLevel(200001)).toBe('super_admin');
      expect(getRequiredApprovalLevel(500000)).toBe('super_admin');
    });
  });

  describe('hasApprovalAuthority', () => {
    it('should allow anyone for "none" level', () => {
      expect(hasApprovalAuthority(2, 'none')).toBe(true); // client
      expect(hasApprovalAuthority(3, 'none')).toBe(true); // staff
    });

    it('should require admin (userType <= 1) for "admin" level', () => {
      expect(hasApprovalAuthority(0, 'admin')).toBe(true);  // super_admin
      expect(hasApprovalAuthority(1, 'admin')).toBe(true);  // admin
      expect(hasApprovalAuthority(2, 'admin')).toBe(false); // client
      expect(hasApprovalAuthority(3, 'admin')).toBe(false); // staff
    });

    it('should require super_admin (userType 0) for "super_admin" level', () => {
      expect(hasApprovalAuthority(0, 'super_admin')).toBe(true);
      expect(hasApprovalAuthority(1, 'super_admin')).toBe(false);
    });
  });

  describe('processRefund', () => {
    it('should process a full refund', async () => {
      const result = await processRefund({
        paymentId: '507f1f77bcf86cd799439011',
        reason: 'Customer request',
        idempotencyKey: 'refund-key-1',
        actorId: 'admin-123',
        actorType: 1, // admin
      });

      expect(result.refundEntry.amount).toBe(16500); // Full refund
      expect(result.refundEntry.status).toBe('succeeded');
      expect(result.payment.status).toBe('refunded');
      expect(mockProvider.refundPayment).toHaveBeenCalledTimes(1);
    });

    it('should process a partial refund', async () => {
      (mockProvider.refundPayment as jest.Mock).mockResolvedValueOnce({
        gatewayRefundId: 're_partial_123',
        amount: 5000,
        status: 'succeeded',
      });

      const result = await processRefund({
        paymentId: '507f1f77bcf86cd799439011',
        amount: 5000,
        reason: 'Overcharge',
        idempotencyKey: 'refund-key-2',
        actorId: 'admin-123',
        actorType: 1,
      });

      expect(result.refundEntry.amount).toBe(5000);
      expect(result.payment.status).toBe('partially_refunded');
    });

    it('should reject refund exceeding captured amount (PAY-INV-06)', async () => {
      currentMockPayment = createMockPayment({
        capturedAmount: 10000,
        refundedAmount: 8000,
      });

      await expect(processRefund({
        paymentId: '507f1f77bcf86cd799439011',
        amount: 5000, // 8000 + 5000 = 13000 > 10000
        reason: 'Too much',
        idempotencyKey: 'refund-key-3',
        actorId: 'admin-123',
        actorType: 1,
      })).rejects.toThrow('exceeds captured amount');
    });

    it('should require admin for refund > $500 (BIL-INV-04)', async () => {
      currentMockPayment = createMockPayment({
        amount: 100000,
        capturedAmount: 100000,
      });

      // Staff (userType 3) trying to refund 60000 cents ($600)
      await expect(processRefund({
        paymentId: '507f1f77bcf86cd799439011',
        amount: 60000,
        reason: 'Large refund',
        idempotencyKey: 'refund-key-4',
        actorId: 'staff-123',
        actorType: 3,
      })).rejects.toThrow('Admin approval');
    });

    it('should require super_admin for refund > $2000 (BIL-INV-04)', async () => {
      currentMockPayment = createMockPayment({
        amount: 500000,
        capturedAmount: 500000,
      });

      // Admin (userType 1) trying to refund 250000 cents ($2500)
      await expect(processRefund({
        paymentId: '507f1f77bcf86cd799439011',
        amount: 250000,
        reason: 'Very large refund',
        idempotencyKey: 'refund-key-5',
        actorId: 'admin-123',
        actorType: 1,
      })).rejects.toThrow('Super Admin approval');
    });

    it('should reject refund on non-succeeded payment', async () => {
      currentMockPayment = createMockPayment({ status: 'pending' });

      await expect(processRefund({
        paymentId: '507f1f77bcf86cd799439011',
        reason: 'Refund pending payment',
        idempotencyKey: 'refund-key-6',
        actorId: 'admin-123',
        actorType: 1,
      })).rejects.toThrow('cannot be refunded');
    });

    it('should throw NotFound for non-existent payment', async () => {
      currentMockPayment = null;

      await expect(processRefund({
        paymentId: '507f1f77bcf86cd799439099',
        reason: 'Nonexistent',
        idempotencyKey: 'refund-key-7',
        actorId: 'admin-123',
        actorType: 1,
      })).rejects.toThrow('not found');
    });
  });
});
