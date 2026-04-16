// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest').default;
import type { Request, Response, NextFunction, RequestHandler } from 'express';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const express = require('express') as typeof import('express').default;

/**
 * E2E Smoke Test: Lead → Order Conversion Flow
 *
 * Tests the critical business path:
 * 1. Create lead from inbound inquiry
 * 2. Log activities (calls, emails)
 * 3. Update lead score / status
 * 4. Convert lead to order
 * 5. Verify lead marked as converted
 * 6. Verify order links back to lead
 * 7. Validate audit trail
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface Lead {
  _id: string;
  leadNumber: string;
  status: number;
  score: number;
  clientName: string;
  email: string;
  mobile: string;
  source: string;
  assignedTo: string | null;
  convertedOrderId: string | null;
  createdAt: string;
}

interface LeadActivity {
  _id: string;
  leadId: string;
  type: string;
  notes: string;
  performedBy: string;
  createdAt: string;
}

// Lead statuses
const LEAD_STATUS = {
  NEW: 1,
  CONTACTED: 2,
  QUALIFIED: 3,
  PROPOSAL: 4,
  NEGOTIATION: 5,
  WON: 6,
  LOST: 7,
  DORMANT: 8,
} as const;

// ─── Simulated Lead-to-Order API ────────────────────────────────────────────

function createLeadOrderApp(): express.Express {
  const app = express();
  app.use(express.json());

  const leads = new Map<string, Lead>();
  const activities: LeadActivity[] = [];
  const orders: Array<{ _id: string; orderNumber: string; leadId: string; clientId: string }> = [];
  const auditLog: Array<{ action: string; resource: string; resourceId: string }> = [];
  let leadCounter = 0;
  let activityCounter = 0;
  let orderCounter = 0;

  const auth: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as Record<string, unknown>).user = { userId: 'staff-001', userType: 1 };
    next();
  };

  // POST /leads — create
  app.post('/api/v1/leads', auth, (req: Request, res: Response): void => {
    const { clientName, email, mobile, source } = req.body as {
      clientName?: string;
      email?: string;
      mobile?: string;
      source?: string;
    };

    if (!clientName || !email) {
      res
        .status(400)
        .json({ status: 400, code: 'VALIDATION_ERROR', message: 'clientName and email required' });
      return;
    }

    // Validate E.164 phone if provided
    if (mobile && !/^\+61\d{9}$/.test(mobile)) {
      res.status(400).json({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Mobile must be E.164 format (+61XXXXXXXXX)',
      });
      return;
    }

    leadCounter++;
    const lead: Lead = {
      _id: `lead-${leadCounter}`,
      leadNumber: `QGS-L-${String(leadCounter).padStart(4, '0')}`,
      status: LEAD_STATUS.NEW,
      score: 0,
      clientName,
      email,
      mobile: mobile ?? '',
      source: source ?? 'website',
      assignedTo: null,
      convertedOrderId: null,
      createdAt: new Date().toISOString(),
    };

    leads.set(lead._id, lead);
    auditLog.push({ action: 'create', resource: 'lead', resourceId: lead._id });

    res.status(201).json({ status: 201, data: lead });
  });

  // GET /leads/:id
  app.get('/api/v1/leads/:id', auth, (req: Request, res: Response): void => {
    const lead = leads.get(req.params.id);
    if (!lead) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Lead not found' });
      return;
    }
    res.status(200).json({ status: 200, data: lead });
  });

  // PUT /leads/:id/status
  app.put('/api/v1/leads/:id/status', auth, (req: Request, res: Response): void => {
    const lead = leads.get(req.params.id);
    if (!lead) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Lead not found' });
      return;
    }

    const { status } = req.body as { status?: number };
    if (!status || status < 1 || status > 8) {
      res
        .status(400)
        .json({ status: 400, code: 'VALIDATION_ERROR', message: 'Status must be 1-8' });
      return;
    }

    lead.status = status;
    auditLog.push({ action: 'update', resource: 'lead', resourceId: lead._id });

    res.status(200).json({ status: 200, data: lead });
  });

  // PUT /leads/:id/assign
  app.put('/api/v1/leads/:id/assign', auth, (req: Request, res: Response): void => {
    const lead = leads.get(req.params.id);
    if (!lead) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Lead not found' });
      return;
    }

    const { staffId } = req.body as { staffId?: string };
    if (!staffId) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'staffId required' });
      return;
    }

    lead.assignedTo = staffId;
    if (lead.status === LEAD_STATUS.NEW) {
      lead.status = LEAD_STATUS.CONTACTED;
    }
    auditLog.push({ action: 'update', resource: 'lead', resourceId: lead._id });

    res.status(200).json({ status: 200, data: lead });
  });

  // POST /leads/:id/activities — log activity
  app.post('/api/v1/leads/:id/activities', auth, (req: Request, res: Response): void => {
    const lead = leads.get(req.params.id);
    if (!lead) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Lead not found' });
      return;
    }

    const { type, notes } = req.body as { type?: string; notes?: string };
    if (!type) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'type required' });
      return;
    }

    activityCounter++;
    const activity: LeadActivity = {
      _id: `activity-${activityCounter}`,
      leadId: lead._id,
      type,
      notes: notes ?? '',
      performedBy: 'staff-001',
      createdAt: new Date().toISOString(),
    };

    activities.push(activity);

    // Auto-increase score on activity
    lead.score = Math.min(100, lead.score + 10);

    res.status(201).json({ status: 201, data: activity });
  });

  // POST /leads/:id/convert — convert to order
  app.post('/api/v1/leads/:id/convert', auth, (req: Request, res: Response): void => {
    const lead = leads.get(req.params.id);
    if (!lead) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Lead not found' });
      return;
    }

    if (lead.convertedOrderId) {
      res.status(409).json({
        status: 409,
        code: 'ALREADY_CONVERTED',
        message: 'Lead already converted to order',
      });
      return;
    }

    if (lead.status === LEAD_STATUS.LOST || lead.status === LEAD_STATUS.DORMANT) {
      res.status(422).json({
        status: 422,
        code: 'INVALID_STATE',
        message: 'Cannot convert a lost or dormant lead',
      });
      return;
    }

    const { financialYear } = req.body as { financialYear?: string };

    orderCounter++;
    const order = {
      _id: `order-${orderCounter}`,
      orderNumber: `QGS-O-${String(orderCounter).padStart(4, '0')}`,
      leadId: lead._id,
      clientId: lead._id, // In real app, would link to client user
      financialYear: financialYear ?? '2025-2026',
    };
    orders.push(order);

    // Mark lead as won
    lead.status = LEAD_STATUS.WON;
    lead.convertedOrderId = order._id;

    auditLog.push({ action: 'create', resource: 'order', resourceId: order._id });
    auditLog.push({ action: 'update', resource: 'lead', resourceId: lead._id });

    res.status(201).json({ status: 201, data: { lead, order } });
  });

  // GET /leads/:id/activities
  app.get('/api/v1/leads/:id/activities', auth, (req: Request, res: Response): void => {
    const leadActivities = activities.filter((a) => a.leadId === req.params.id);
    res.status(200).json({ status: 200, data: leadActivities });
  });

  // GET /_test/audit
  app.get('/api/v1/_test/audit', (_req: Request, res: Response): void => {
    res.status(200).json({ status: 200, data: auditLog });
  });

  return app;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('E2E: Lead → Order Conversion', () => {
  const app = createLeadOrderApp();

  // ─── Full Flow ────────────────────────────────────────────────────

  describe('Complete lead-to-order lifecycle', () => {
    let leadId: string;

    test('1. Create lead from inbound inquiry', async () => {
      const res = await request(app).post('/api/v1/leads').send({
        clientName: 'Sarah Wilson',
        email: 'sarah@example.com',
        mobile: '+61412345678',
        source: 'website',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.leadNumber).toBe('QGS-L-0001');
      expect(res.body.data.status).toBe(LEAD_STATUS.NEW);
      expect(res.body.data.score).toBe(0);
      leadId = res.body.data._id as string;
    });

    test('2. Assign to staff member', async () => {
      const res = await request(app)
        .put(`/api/v1/leads/${leadId}/assign`)
        .send({ staffId: 'staff-001' });

      expect(res.status).toBe(200);
      expect(res.body.data.assignedTo).toBe('staff-001');
      expect(res.body.data.status).toBe(LEAD_STATUS.CONTACTED);
    });

    test('3. Log call activity (score increases)', async () => {
      const res = await request(app)
        .post(`/api/v1/leads/${leadId}/activities`)
        .send({ type: 'call', notes: 'Discussed tax return requirements' });

      expect(res.status).toBe(201);

      const lead = await request(app).get(`/api/v1/leads/${leadId}`);
      expect(lead.body.data.score).toBe(10);
    });

    test('4. Log email follow-up (score increases further)', async () => {
      await request(app)
        .post(`/api/v1/leads/${leadId}/activities`)
        .send({ type: 'email', notes: 'Sent service proposal' });

      const lead = await request(app).get(`/api/v1/leads/${leadId}`);
      expect(lead.body.data.score).toBe(20);
    });

    test('5. Advance to qualified status', async () => {
      const res = await request(app)
        .put(`/api/v1/leads/${leadId}/status`)
        .send({ status: LEAD_STATUS.QUALIFIED });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(LEAD_STATUS.QUALIFIED);
    });

    test('6. Convert lead to order', async () => {
      const res = await request(app)
        .post(`/api/v1/leads/${leadId}/convert`)
        .send({ financialYear: '2025-2026' });

      expect(res.status).toBe(201);
      expect(res.body.data.lead.status).toBe(LEAD_STATUS.WON);
      expect(res.body.data.lead.convertedOrderId).toBeDefined();
      expect(res.body.data.order.leadId).toBe(leadId);
      expect(res.body.data.order.orderNumber).toMatch(/^QGS-O-/);
    });

    test('7. Lead marked as won with order reference', async () => {
      const res = await request(app).get(`/api/v1/leads/${leadId}`);

      expect(res.body.data.status).toBe(LEAD_STATUS.WON);
      expect(res.body.data.convertedOrderId).toBeDefined();
    });

    test('8. Cannot convert same lead twice', async () => {
      const res = await request(app)
        .post(`/api/v1/leads/${leadId}/convert`)
        .send({ financialYear: '2025-2026' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ALREADY_CONVERTED');
    });

    test('9. Activity trail is preserved', async () => {
      const res = await request(app).get(`/api/v1/leads/${leadId}/activities`);

      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].type).toBe('call');
      expect(res.body.data[1].type).toBe('email');
    });

    test('10. Audit log records all mutations', async () => {
      const res = await request(app).get('/api/v1/_test/audit');

      const leadEntries = res.body.data.filter(
        (e: { resourceId: string }) => e.resourceId === leadId,
      );
      // create + assign + status update + conversion
      expect(leadEntries.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ─── Validation ───────────────────────────────────────────────────

  describe('Input Validation', () => {
    test('E.164 phone validation rejects invalid format', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .send({ clientName: 'Test', email: 'test@example.com', mobile: '0412345678' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('E.164');
    });

    test('E.164 accepts valid Australian number', async () => {
      const res = await request(app)
        .post('/api/v1/leads')
        .send({ clientName: 'Test', email: 'valid@example.com', mobile: '+61412345678' });

      expect(res.status).toBe(201);
    });

    test('cannot convert lost lead', async () => {
      const create = await request(app)
        .post('/api/v1/leads')
        .send({ clientName: 'Lost Lead', email: 'lost@example.com' });

      await request(app)
        .put(`/api/v1/leads/${create.body.data._id}/status`)
        .send({ status: LEAD_STATUS.LOST });

      const res = await request(app)
        .post(`/api/v1/leads/${create.body.data._id}/convert`)
        .send({ financialYear: '2025-2026' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INVALID_STATE');
    });

    test('cannot convert dormant lead', async () => {
      const create = await request(app)
        .post('/api/v1/leads')
        .send({ clientName: 'Dormant Lead', email: 'dormant@example.com' });

      await request(app)
        .put(`/api/v1/leads/${create.body.data._id}/status`)
        .send({ status: LEAD_STATUS.DORMANT });

      const res = await request(app)
        .post(`/api/v1/leads/${create.body.data._id}/convert`)
        .send({ financialYear: '2025-2026' });

      expect(res.status).toBe(422);
    });
  });
});
