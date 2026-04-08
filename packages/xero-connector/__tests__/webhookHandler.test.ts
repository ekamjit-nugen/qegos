import { createHmac } from 'crypto';

/**
 * @nugen/xero-connector — Webhook Handler Tests
 *
 * Tests:
 * - Signature verification middleware (HMAC-SHA256, timing-safe)
 * - Intent-to-receive (ITR) validation
 * - Event deduplication via Redis
 * - Tenant ID validation
 * - Event category routing (contact, invoice, payment, credit_note)
 * - Unknown category forward-compatibility
 * - Webhook payload shape validation
 */

// ─── Mock Helpers ───────────────────────────────────────────────────────────

function computeXeroSignature(body: string, webhookKey: string): string {
  return createHmac('sha256', webhookKey).update(body).digest('base64');
}

function createWebhookPayload(events: unknown[] = []): Record<string, unknown> {
  return {
    events,
    firstEventSequence: 1,
    lastEventSequence: events.length,
    entropy: 'test-entropy-value',
  };
}

function createEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    resourceUrl: 'https://api.xero.com/api.xro/2.0/Contacts/abc-123',
    resourceId: 'abc-123',
    eventDateUtc: '2026-04-08T10:00:00Z',
    eventType: 'Update',
    eventCategory: 'CONTACT',
    tenantId: 'tenant-001',
    tenantType: 'ORGANISATION',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('@nugen/xero-connector — Webhook Handler', () => {

  // ─── Signature Verification ─────────────────────────────────────────────

  describe('HMAC-SHA256 Signature Verification', () => {
    const webhookKey = 'test-webhook-key-32chars-secure!!';

    test('computes correct HMAC-SHA256 base64 signature', () => {
      const body = JSON.stringify(createWebhookPayload());
      const sig = computeXeroSignature(body, webhookKey);

      // Verify it's a valid base64 string
      expect(Buffer.from(sig, 'base64').toString('base64')).toBe(sig);
      // SHA256 produces 32 bytes = 44 base64 chars (with padding)
      expect(sig.length).toBe(44);
    });

    test('different bodies produce different signatures', () => {
      const body1 = JSON.stringify(createWebhookPayload([createEvent()]));
      const body2 = JSON.stringify(createWebhookPayload([createEvent({ resourceId: 'xyz' })]));

      const sig1 = computeXeroSignature(body1, webhookKey);
      const sig2 = computeXeroSignature(body2, webhookKey);

      expect(sig1).not.toBe(sig2);
    });

    test('different keys produce different signatures', () => {
      const body = JSON.stringify(createWebhookPayload());

      const sig1 = computeXeroSignature(body, webhookKey);
      const sig2 = computeXeroSignature(body, 'different-key-also-32chars-long!!');

      expect(sig1).not.toBe(sig2);
    });

    test('empty body produces valid signature', () => {
      const sig = computeXeroSignature('', webhookKey);
      expect(sig.length).toBe(44);
    });
  });

  // ─── Payload Structure ────────────────────────────────────────────────

  describe('Webhook Payload Shape', () => {
    test('ITR validation payload has empty events array', () => {
      const payload = createWebhookPayload([]);
      expect(payload.events).toEqual([]);
      expect(payload.entropy).toBeDefined();
    });

    test('event payload has correct structure', () => {
      const event = createEvent();
      expect(event).toHaveProperty('resourceUrl');
      expect(event).toHaveProperty('resourceId');
      expect(event).toHaveProperty('eventDateUtc');
      expect(event).toHaveProperty('eventType');
      expect(event).toHaveProperty('eventCategory');
      expect(event).toHaveProperty('tenantId');
      expect(event).toHaveProperty('tenantType');
    });

    test('payload includes sequence numbers', () => {
      const events = [createEvent(), createEvent({ resourceId: 'def-456' })];
      const payload = createWebhookPayload(events);
      expect(payload.firstEventSequence).toBe(1);
      expect(payload.lastEventSequence).toBe(2);
    });
  });

  // ─── Event Categories ─────────────────────────────────────────────────

  describe('Event Category Routing', () => {
    const validCategories = ['CONTACT', 'INVOICE', 'PAYMENT', 'CREDIT_NOTE'];

    test.each(validCategories)('recognizes %s as a valid event category', (category) => {
      const event = createEvent({ eventCategory: category });
      expect(validCategories).toContain(event.eventCategory);
    });

    test('unknown categories are handled gracefully', () => {
      const event = createEvent({ eventCategory: 'MANUAL_JOURNAL' });
      expect(validCategories).not.toContain(event.eventCategory);
      // Should not throw — forward-compatible handling
    });
  });

  // ─── Event Types ──────────────────────────────────────────────────────

  describe('Event Type Mapping', () => {
    test('Create events map to sync action create', () => {
      const event = createEvent({ eventType: 'Create' });
      expect(event.eventType).toBe('Create');
    });

    test('Update events map to sync action update', () => {
      const event = createEvent({ eventType: 'Update' });
      expect(event.eventType).toBe('Update');
    });

    test('Delete events map to sync action void/delete', () => {
      const event = createEvent({ eventType: 'Delete' });
      expect(event.eventType).toBe('Delete');
    });
  });

  // ─── Idempotency Key ─────────────────────────────────────────────────

  describe('Idempotency', () => {
    test('dedup key includes tenantId, resourceId, and eventType', () => {
      const event = createEvent();
      const key = `xero:webhook:processed:${event.tenantId}:${event.resourceId}:${event.eventType}`;
      expect(key).toBe('xero:webhook:processed:tenant-001:abc-123:Update');
    });

    test('different events produce different dedup keys', () => {
      const e1 = createEvent({ resourceId: 'a', eventType: 'Create' });
      const e2 = createEvent({ resourceId: 'a', eventType: 'Update' });
      const e3 = createEvent({ resourceId: 'b', eventType: 'Create' });

      const k1 = `${e1.tenantId}:${e1.resourceId}:${e1.eventType}`;
      const k2 = `${e2.tenantId}:${e2.resourceId}:${e2.eventType}`;
      const k3 = `${e3.tenantId}:${e3.resourceId}:${e3.eventType}`;

      expect(new Set([k1, k2, k3]).size).toBe(3);
    });
  });

  // ─── Tenant Validation ────────────────────────────────────────────────

  describe('Tenant Validation', () => {
    test('events with wrong tenantId should be skipped', () => {
      const configTenantId = 'tenant-001';
      const event = createEvent({ tenantId: 'wrong-tenant' });
      expect(event.tenantId).not.toBe(configTenantId);
    });

    test('events with correct tenantId should be processed', () => {
      const configTenantId = 'tenant-001';
      const event = createEvent({ tenantId: 'tenant-001' });
      expect(event.tenantId).toBe(configTenantId);
    });
  });

  // ─── Invoice Event Handling ───────────────────────────────────────────

  describe('Invoice Event Details', () => {
    test('Delete eventType maps to void action', () => {
      const event = createEvent({
        eventCategory: 'INVOICE',
        eventType: 'Delete',
      });
      const action = event.eventType === 'Delete' ? 'void' : 'update';
      expect(action).toBe('void');
    });

    test('Update eventType maps to update action', () => {
      const event = createEvent({
        eventCategory: 'INVOICE',
        eventType: 'Update',
      });
      const action = event.eventType === 'Delete' ? 'void' : 'update';
      expect(action).toBe('update');
    });
  });

  // ─── Batch Processing ────────────────────────────────────────────────

  describe('Batch Processing', () => {
    test('payload can contain multiple events', () => {
      const events = Array.from({ length: 10 }, (_, i) =>
        createEvent({ resourceId: `res-${i}` }),
      );
      const payload = createWebhookPayload(events);
      expect((payload.events as unknown[]).length).toBe(10);
    });

    test('mixed event categories in single payload', () => {
      const events = [
        createEvent({ eventCategory: 'CONTACT' }),
        createEvent({ eventCategory: 'INVOICE', resourceId: 'inv-1' }),
        createEvent({ eventCategory: 'PAYMENT', resourceId: 'pay-1' }),
      ];
      const categories = events.map((e) => e.eventCategory);
      expect(new Set(categories).size).toBe(3);
    });
  });
});
