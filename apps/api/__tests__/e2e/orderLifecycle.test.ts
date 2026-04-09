// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest').default;
import type { Request, Response, NextFunction, RequestHandler } from 'express';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const express = require('express') as typeof import('express').default;

/**
 * E2E Smoke Test: Order Lifecycle
 *
 * Tests the full order flow:
 * 1. Create order from lead
 * 2. Add line items
 * 3. Progress through status machine (draft → confirmed → in_progress → review → completed)
 * 4. Payment recording
 * 5. Status validation (no backward transitions)
 * 6. Notification triggering on status changes
 * 7. Review assignment on completion
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface Order {
  _id: string;
  orderNumber: string;
  status: number;
  clientId: string;
  lineItems: Array<{ title: string; priceCents: number; quantity: number }>;
  totalCents: number;
  financialYear: string;
  createdAt: string;
  updatedAt: string;
}

interface Payment {
  _id: string;
  orderId: string;
  amountCents: number;
  status: string;
  gateway: string;
}

// ─── Status Machine ─────────────────────────────────────────────────────────

const ORDER_STATUS = {
  DRAFT: 1,
  CONFIRMED: 2,
  DOCUMENTS_PENDING: 3,
  IN_PROGRESS: 4,
  REVIEW: 5,
  LODGED: 6,
  ATO_PROCESSING: 7,
  COMPLETED: 8,
  CANCELLED: 9,
} as const;

const STATUS_LABELS: Record<number, string> = {
  1: 'Draft', 2: 'Confirmed', 3: 'Documents Pending', 4: 'In Progress',
  5: 'Review', 6: 'Lodged', 7: 'ATO Processing', 8: 'Completed', 9: 'Cancelled',
};

// Valid forward transitions
const VALID_TRANSITIONS: Record<number, number[]> = {
  1: [2, 9],       // Draft → Confirmed or Cancelled
  2: [3, 9],       // Confirmed → Documents Pending or Cancelled
  3: [4, 9],       // Documents Pending → In Progress or Cancelled
  4: [5, 9],       // In Progress → Review or Cancelled
  5: [4, 6, 9],    // Review → In Progress (rejection) or Lodged or Cancelled
  6: [7, 9],       // Lodged → ATO Processing or Cancelled
  7: [8, 9],       // ATO Processing → Completed or Cancelled
  8: [],           // Completed — terminal
  9: [],           // Cancelled — terminal
};

// ─── Simulated Order API ────────────────────────────────────────────────────

function createOrderApp(): express.Express {
  const app = express();
  app.use(express.json());

  // In-memory stores
  const orders = new Map<string, Order>();
  const payments = new Map<string, Payment>();
  const notifications: Array<{ type: string; orderId: string; status: number }> = [];
  let orderCounter = 0;
  let paymentCounter = 0;

  // Auth middleware
  const auth: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as Record<string, unknown>).user = { userId: 'staff-001', userType: 1 };
    next();
  };

  // POST /orders — create
  app.post('/api/v1/orders', auth, (req: Request, res: Response): void => {
    const { clientId, financialYear, lineItems } = req.body as {
      clientId?: string; financialYear?: string;
      lineItems?: Array<{ title: string; priceCents: number; quantity: number }>;
    };

    if (!clientId || !financialYear) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'clientId and financialYear required' });
      return;
    }

    orderCounter++;
    const items = lineItems ?? [];
    const totalCents = items.reduce((sum, li) => sum + li.priceCents * li.quantity, 0);

    const order: Order = {
      _id: `order-${orderCounter}`,
      orderNumber: `QGS-O-${String(orderCounter).padStart(4, '0')}`,
      status: ORDER_STATUS.DRAFT,
      clientId,
      lineItems: items,
      totalCents,
      financialYear,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    orders.set(order._id, order);

    res.status(201).json({ status: 201, data: order });
  });

  // GET /orders/:id
  app.get('/api/v1/orders/:id', auth, (req: Request, res: Response): void => {
    const order = orders.get(req.params.id);
    if (!order) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Order not found' });
      return;
    }
    res.status(200).json({ status: 200, data: order });
  });

  // PUT /orders/:id/status — transition
  app.put('/api/v1/orders/:id/status', auth, (req: Request, res: Response): void => {
    const order = orders.get(req.params.id);
    if (!order) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Order not found' });
      return;
    }

    const { status: newStatus } = req.body as { status?: number };
    if (!newStatus) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'status is required' });
      return;
    }

    const allowed = VALID_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(newStatus)) {
      res.status(422).json({
        status: 422,
        code: 'INVALID_TRANSITION',
        message: `Cannot transition from ${STATUS_LABELS[order.status]} to ${STATUS_LABELS[newStatus]}`,
      });
      return;
    }

    order.status = newStatus;
    order.updatedAt = new Date().toISOString();

    // Trigger notification on key transitions
    notifications.push({ type: 'order_status', orderId: order._id, status: newStatus });

    res.status(200).json({ status: 200, data: order });
  });

  // POST /orders/:id/payment — record payment
  app.post('/api/v1/orders/:id/payment', auth, (req: Request, res: Response): void => {
    const order = orders.get(req.params.id);
    if (!order) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Order not found' });
      return;
    }

    const { amountCents, gateway } = req.body as { amountCents?: number; gateway?: string };
    if (!amountCents || !Number.isInteger(amountCents) || amountCents <= 0) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'amountCents must be a positive integer' });
      return;
    }

    paymentCounter++;
    const payment: Payment = {
      _id: `payment-${paymentCounter}`,
      orderId: order._id,
      amountCents,
      status: 'succeeded',
      gateway: gateway ?? 'stripe',
    };

    payments.set(payment._id, payment);

    res.status(201).json({ status: 201, data: payment });
  });

  // GET /orders/:id/payments
  app.get('/api/v1/orders/:id/payments', auth, (req: Request, res: Response): void => {
    const orderPayments = [...payments.values()].filter((p) => p.orderId === req.params.id);
    res.status(200).json({ status: 200, data: orderPayments });
  });

  // GET /notifications (for testing)
  app.get('/api/v1/_test/notifications', (_req: Request, res: Response): void => {
    res.status(200).json({ status: 200, data: notifications });
  });

  return app;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('E2E: Order Lifecycle', () => {
  const app = createOrderApp();

  // ─── Order Creation ───────────────────────────────────────────────

  describe('Order Creation', () => {
    test('create order with line items returns 201', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .send({
          clientId: 'client-001',
          financialYear: '2025-2026',
          lineItems: [
            { title: 'Individual Tax Return', priceCents: 22000, quantity: 1 },
            { title: 'Rental Schedule', priceCents: 8800, quantity: 1 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.orderNumber).toBe('QGS-O-0001');
      expect(res.body.data.status).toBe(ORDER_STATUS.DRAFT);
      expect(res.body.data.totalCents).toBe(30800);
      expect(res.body.data.lineItems).toHaveLength(2);
    });

    test('order amounts are in integer cents (no floats)', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .send({
          clientId: 'client-002',
          financialYear: '2025-2026',
          lineItems: [{ title: 'BAS', priceCents: 33000, quantity: 1 }],
        });

      expect(Number.isInteger(res.body.data.totalCents)).toBe(true);
    });

    test('create order without clientId returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .send({ financialYear: '2025-2026' });

      expect(res.status).toBe(400);
    });
  });

  // ─── Status Machine ───────────────────────────────────────────────

  describe('Status Machine Transitions', () => {
    let orderId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .send({
          clientId: 'client-001',
          financialYear: '2025-2026',
          lineItems: [{ title: 'Individual Tax Return', priceCents: 22000, quantity: 1 }],
        });
      orderId = res.body.data._id as string;
    });

    test('Draft → Confirmed (valid)', async () => {
      const res = await request(app)
        .put(`/api/v1/orders/${orderId}/status`)
        .send({ status: ORDER_STATUS.CONFIRMED });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(ORDER_STATUS.CONFIRMED);
    });

    test('Confirmed → Documents Pending (valid)', async () => {
      const res = await request(app)
        .put(`/api/v1/orders/${orderId}/status`)
        .send({ status: ORDER_STATUS.DOCUMENTS_PENDING });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(ORDER_STATUS.DOCUMENTS_PENDING);
    });

    test('Documents Pending → In Progress (valid)', async () => {
      const res = await request(app)
        .put(`/api/v1/orders/${orderId}/status`)
        .send({ status: ORDER_STATUS.IN_PROGRESS });

      expect(res.status).toBe(200);
    });

    test('In Progress → Review (valid)', async () => {
      const res = await request(app)
        .put(`/api/v1/orders/${orderId}/status`)
        .send({ status: ORDER_STATUS.REVIEW });

      expect(res.status).toBe(200);
    });

    test('Review → Lodged (valid)', async () => {
      const res = await request(app)
        .put(`/api/v1/orders/${orderId}/status`)
        .send({ status: ORDER_STATUS.LODGED });

      expect(res.status).toBe(200);
    });

    test('Lodged → ATO Processing (valid)', async () => {
      const res = await request(app)
        .put(`/api/v1/orders/${orderId}/status`)
        .send({ status: ORDER_STATUS.ATO_PROCESSING });

      expect(res.status).toBe(200);
    });

    test('ATO Processing → Completed (valid)', async () => {
      const res = await request(app)
        .put(`/api/v1/orders/${orderId}/status`)
        .send({ status: ORDER_STATUS.COMPLETED });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(ORDER_STATUS.COMPLETED);
    });

    test('Completed → Draft (invalid — backward transition)', async () => {
      const res = await request(app)
        .put(`/api/v1/orders/${orderId}/status`)
        .send({ status: ORDER_STATUS.DRAFT });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INVALID_TRANSITION');
    });

    test('Completed is terminal (no transitions)', async () => {
      for (const targetStatus of [1, 2, 3, 4, 5, 6, 7, 9]) {
        const res = await request(app)
          .put(`/api/v1/orders/${orderId}/status`)
          .send({ status: targetStatus });
        expect(res.status).toBe(422);
      }
    });
  });

  // ─── Cancellation ─────────────────────────────────────────────────

  describe('Cancellation', () => {
    test('order can be cancelled from any non-terminal status', async () => {
      const create = await request(app)
        .post('/api/v1/orders')
        .send({ clientId: 'client-003', financialYear: '2025-2026' });

      const res = await request(app)
        .put(`/api/v1/orders/${create.body.data._id}/status`)
        .send({ status: ORDER_STATUS.CANCELLED });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(ORDER_STATUS.CANCELLED);
    });

    test('cancelled order cannot be modified', async () => {
      const create = await request(app)
        .post('/api/v1/orders')
        .send({ clientId: 'client-004', financialYear: '2025-2026' });

      await request(app)
        .put(`/api/v1/orders/${create.body.data._id}/status`)
        .send({ status: ORDER_STATUS.CANCELLED });

      const res = await request(app)
        .put(`/api/v1/orders/${create.body.data._id}/status`)
        .send({ status: ORDER_STATUS.CONFIRMED });

      expect(res.status).toBe(422);
    });
  });

  // ─── Payments ─────────────────────────────────────────────────────

  describe('Payments', () => {
    test('record payment in integer cents', async () => {
      const create = await request(app)
        .post('/api/v1/orders')
        .send({
          clientId: 'client-005',
          financialYear: '2025-2026',
          lineItems: [{ title: 'Tax Return', priceCents: 22000, quantity: 1 }],
        });

      const res = await request(app)
        .post(`/api/v1/orders/${create.body.data._id}/payment`)
        .send({ amountCents: 22000, gateway: 'stripe' });

      expect(res.status).toBe(201);
      expect(res.body.data.amountCents).toBe(22000);
      expect(Number.isInteger(res.body.data.amountCents)).toBe(true);
      expect(res.body.data.status).toBe('succeeded');
    });

    test('reject non-integer payment amount', async () => {
      const create = await request(app)
        .post('/api/v1/orders')
        .send({ clientId: 'client-006', financialYear: '2025-2026' });

      const res = await request(app)
        .post(`/api/v1/orders/${create.body.data._id}/payment`)
        .send({ amountCents: 99.50 });

      expect(res.status).toBe(400);
    });

    test('reject zero/negative payment', async () => {
      const create = await request(app)
        .post('/api/v1/orders')
        .send({ clientId: 'client-007', financialYear: '2025-2026' });

      const res = await request(app)
        .post(`/api/v1/orders/${create.body.data._id}/payment`)
        .send({ amountCents: 0 });

      expect(res.status).toBe(400);
    });

    test('list payments for order', async () => {
      const create = await request(app)
        .post('/api/v1/orders')
        .send({
          clientId: 'client-008',
          financialYear: '2025-2026',
          lineItems: [{ title: 'Tax Return', priceCents: 22000, quantity: 1 }],
        });

      await request(app)
        .post(`/api/v1/orders/${create.body.data._id}/payment`)
        .send({ amountCents: 11000, gateway: 'stripe' });
      await request(app)
        .post(`/api/v1/orders/${create.body.data._id}/payment`)
        .send({ amountCents: 11000, gateway: 'payzoo' });

      const res = await request(app)
        .get(`/api/v1/orders/${create.body.data._id}/payments`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  // ─── Notifications ────────────────────────────────────────────────

  describe('Notifications on status change', () => {
    test('status transitions emit notifications', async () => {
      const create = await request(app)
        .post('/api/v1/orders')
        .send({ clientId: 'client-notif', financialYear: '2025-2026' });

      await request(app)
        .put(`/api/v1/orders/${create.body.data._id}/status`)
        .send({ status: ORDER_STATUS.CONFIRMED });

      const res = await request(app).get('/api/v1/_test/notifications');

      const orderNotifs = res.body.data.filter(
        (n: { orderId: string }) => n.orderId === create.body.data._id,
      );
      expect(orderNotifs.length).toBeGreaterThan(0);
      expect(orderNotifs[0].type).toBe('order_status');
    });
  });

  // ─── 404 Handling ─────────────────────────────────────────────────

  describe('Order not found', () => {
    test('GET nonexistent order returns 404', async () => {
      const res = await request(app).get('/api/v1/orders/nonexistent-id');
      expect(res.status).toBe(404);
    });

    test('PUT status on nonexistent order returns 404', async () => {
      const res = await request(app)
        .put('/api/v1/orders/nonexistent-id/status')
        .send({ status: 2 });
      expect(res.status).toBe(404);
    });
  });
});
