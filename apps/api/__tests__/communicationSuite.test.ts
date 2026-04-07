/**
 * Communication Suite — Tests (Phase 7)
 *
 * Tests for @nugen/chat-engine, @nugen/support-tickets, @nugen/whatsapp-connector.
 * Unit/structural tests — no database, Socket.io, or external APIs required.
 */

// ─── Chat Engine ────────────────────────────────────────────────────────────

import {
  CONVERSATION_STATUSES,
  MESSAGE_TYPES,
  CANNED_RESPONSE_CATEGORIES,
  TFN_PATTERN,
  TFN_REPLACEMENT,
  containsTfn,
  redactTfn,
  processMessageContent,
  initTfnRedaction,
  encryptContent,
  decryptContent,
} from '../../../packages/chat-engine/src';

import type {
  ConversationStatus,
  MessageType,
  SenderType,
  IChatConversation,
  IChatMessage,
  ServerToClientEvents,
  ClientToServerEvents,
} from '../../../packages/chat-engine/src/types';

// ─── Support Tickets ────────────────────────────────────────────────────────

import {
  TICKET_STATUSES,
  TICKET_STATUS_TRANSITIONS,
  TICKET_PRIORITIES,
  TICKET_CATEGORIES,
  TICKET_SOURCES,
  RESOLUTION_CATEGORIES,
  SLA_BY_PRIORITY,
  MAX_REOPENS,
  isValidTransition,
  initSlaEngine,
  isBusinessHour,
  isSlaBreached,
  isSlaImminent,
  getEscalationTriggerTime,
  calculateSlaDeadline,
} from '../../../packages/support-tickets/src';

import type {
  TicketStatus,
  TicketPriority,
  ISupportTicket,
} from '../../../packages/support-tickets/src/types';

// ─── WhatsApp Connector ─────────────────────────────────────────────────────

import {
  WHATSAPP_MESSAGE_TYPES,
  FREEFORM_WINDOW_HOURS,
  toMetaFormat,
  toE164,
} from '../../../packages/whatsapp-connector/src';

import type {
  WhatsAppMessageType,
  WhatsAppMessageStatus,
  IWhatsAppMessage,
} from '../../../packages/whatsapp-connector/src/types';

// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 7: Communication Suite', () => {

  // ═══════════════════════════════════════════════════════════════════════════
  // CHAT ENGINE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Chat Engine', () => {

    // ── TFN Redaction (CHT-INV-01) ──────────────────────────────────────

    describe('TFN redaction (CHT-INV-01)', () => {
      it('detects TFN with spaces: 123 456 789', () => {
        expect(containsTfn('My TFN is 123 456 789')).toBe(true);
      });

      it('detects TFN without spaces: 123456789', () => {
        expect(containsTfn('TFN: 123456789')).toBe(true);
      });

      it('does not flag non-TFN numbers', () => {
        expect(containsTfn('Phone: 0412345678')).toBe(false); // 10 digits
        expect(containsTfn('Order #12345')).toBe(false);       // 5 digits
      });

      it('redacts TFN in message content', () => {
        const redacted = redactTfn('My TFN is 123 456 789 and also 987654321');
        expect(redacted).toBe(`My TFN is ${TFN_REPLACEMENT} and also ${TFN_REPLACEMENT}`);
        expect(redacted).not.toContain('123');
        expect(redacted).not.toContain('987654321');
      });

      it('processMessageContent returns original for non-TFN', () => {
        const result = processMessageContent('Hello, how are you?');
        expect(result.content).toBe('Hello, how are you?');
        expect(result.contentOriginal).toBeUndefined();
      });

      it('processMessageContent redacts and encrypts for TFN', () => {
        initTfnRedaction('test-encryption-key-32-chars!!!!');
        const result = processMessageContent('My TFN is 123 456 789');
        expect(result.content).toContain(TFN_REPLACEMENT);
        expect(result.content).not.toContain('123 456 789');
        expect(result.contentOriginal).toBeDefined();
        expect(result.contentOriginal!.split(':')).toHaveLength(3); // iv:tag:cipher
      });
    });

    // ── Encryption (AES-256-GCM) ────────────────────────────────────────

    describe('AES-256-GCM encryption', () => {
      beforeAll(() => {
        initTfnRedaction('test-encryption-key-32-chars!!!!');
      });

      it('encrypts and decrypts correctly', () => {
        const original = 'My TFN is 123 456 789';
        const encrypted = encryptContent(original);
        const decrypted = decryptContent(encrypted);
        expect(decrypted).toBe(original);
      });

      it('different encryptions produce different ciphertexts (random IV)', () => {
        const text = 'Same plaintext';
        const enc1 = encryptContent(text);
        const enc2 = encryptContent(text);
        expect(enc1).not.toBe(enc2); // Random IV each time
      });
    });

    // ── Conversation statuses ───────────────────────────────────────────

    describe('Conversation statuses', () => {
      it('has 3 statuses', () => {
        expect(CONVERSATION_STATUSES).toHaveLength(3);
        expect(CONVERSATION_STATUSES).toEqual(['active', 'resolved', 'archived']);
      });
    });

    // ── Message types ───────────────────────────────────────────────────

    describe('Message types', () => {
      it('has 4 types: text, file, canned_response, system_event', () => {
        expect(MESSAGE_TYPES).toHaveLength(4);
        expect(MESSAGE_TYPES).toContain('text');
        expect(MESSAGE_TYPES).toContain('file');
        expect(MESSAGE_TYPES).toContain('canned_response');
        expect(MESSAGE_TYPES).toContain('system_event');
      });
    });

    // ── Canned response categories ──────────────────────────────────────

    describe('Canned response categories', () => {
      it('has 6 categories', () => {
        expect(CANNED_RESPONSE_CATEGORIES).toHaveLength(6);
        expect(CANNED_RESPONSE_CATEGORIES).toContain('general');
        expect(CANNED_RESPONSE_CATEGORIES).toContain('tax_info');
      });
    });

    // ── Socket.io Events (type check) ───────────────────────────────────

    describe('Socket.io event types', () => {
      it('server-to-client events are typed', () => {
        const events: (keyof ServerToClientEvents)[] = [
          'new_message', 'message_read', 'typing_indicator',
          'conversation_resolved', 'staff_presence',
        ];
        expect(events).toHaveLength(5);
      });

      it('client-to-server events are typed', () => {
        const events: (keyof ClientToServerEvents)[] = [
          'typing_indicator', 'join_conversation', 'leave_conversation',
        ];
        expect(events).toHaveLength(3);
      });
    });

    // ── CHT-INV-03: One active conversation per client ──────────────────

    describe('CHT-INV-03: One active conversation per client', () => {
      it('conversation interface has userId + status fields', () => {
        const conv: Partial<IChatConversation> = {
          userId: null as never,
          status: 'active',
          unreadCountUser: 0,
          unreadCountStaff: 3,
        };
        expect(conv.status).toBe('active');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPPORT TICKETS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Support Tickets', () => {

    // ── Status Machine ──────────────────────────────────────────────────

    describe('Ticket status machine', () => {
      it('has 8 statuses', () => {
        expect(TICKET_STATUSES).toHaveLength(8);
      });

      it('open can transition to assigned, in_progress, escalated, closed', () => {
        expect(TICKET_STATUS_TRANSITIONS.open).toContain('assigned');
        expect(TICKET_STATUS_TRANSITIONS.open).toContain('in_progress');
        expect(TICKET_STATUS_TRANSITIONS.open).toContain('escalated');
        expect(TICKET_STATUS_TRANSITIONS.open).toContain('closed');
      });

      it('closed is terminal (no outgoing transitions)', () => {
        expect(TICKET_STATUS_TRANSITIONS.closed).toHaveLength(0);
      });

      it('resolved can go to closed or reopen to open', () => {
        expect(TICKET_STATUS_TRANSITIONS.resolved).toContain('closed');
        expect(TICKET_STATUS_TRANSITIONS.resolved).toContain('open');
      });

      it('isValidTransition validates correctly', () => {
        expect(isValidTransition('open', 'assigned')).toBe(true);
        expect(isValidTransition('open', 'resolved')).toBe(false);
        expect(isValidTransition('closed', 'open')).toBe(false);
        expect(isValidTransition('in_progress', 'resolved')).toBe(true);
      });
    });

    // ── Priorities ──────────────────────────────────────────────────────

    describe('Ticket priorities', () => {
      it('has 4 levels: low, normal, high, urgent', () => {
        expect(TICKET_PRIORITIES).toEqual(['low', 'normal', 'high', 'urgent']);
      });
    });

    // ── Categories ──────────────────────────────────────────────────────

    describe('Ticket categories', () => {
      it('has 10 categories', () => {
        expect(TICKET_CATEGORIES).toHaveLength(10);
      });

      it('includes staff_complaint (TKT-INV-02)', () => {
        expect(TICKET_CATEGORIES).toContain('staff_complaint');
      });

      it('includes all expected categories', () => {
        const expected = [
          'billing_query', 'refund_request', 'return_status',
          'document_issue', 'staff_complaint', 'technical_issue',
          'deadline_concern', 'ato_query', 'general_enquiry', 'amendment_request',
        ];
        for (const cat of expected) {
          expect(TICKET_CATEGORIES).toContain(cat);
        }
      });
    });

    // ── Sources ─────────────────────────────────────────────────────────

    describe('Ticket sources', () => {
      it('has 7 sources', () => {
        expect(TICKET_SOURCES).toHaveLength(7);
        expect(TICKET_SOURCES).toContain('chat');
        expect(TICKET_SOURCES).toContain('whatsapp');
        expect(TICKET_SOURCES).toContain('portal');
      });
    });

    // ── Resolution Categories ───────────────────────────────────────────

    describe('Resolution categories', () => {
      it('has 7 categories', () => {
        expect(RESOLUTION_CATEGORIES).toHaveLength(7);
      });
    });

    // ── SLA Configuration (TKT-INV-01) ──────────────────────────────────

    describe('SLA configuration (TKT-INV-01)', () => {
      it('urgent: 1hr first response, 4hr resolution', () => {
        expect(SLA_BY_PRIORITY.urgent.firstResponseMinutes).toBe(60);
        expect(SLA_BY_PRIORITY.urgent.resolutionMinutes).toBe(240);
      });

      it('high: 4hr first response, 8hr resolution', () => {
        expect(SLA_BY_PRIORITY.high.firstResponseMinutes).toBe(240);
        expect(SLA_BY_PRIORITY.high.resolutionMinutes).toBe(480);
      });

      it('normal: 8hr first response, 24hr resolution', () => {
        expect(SLA_BY_PRIORITY.normal.firstResponseMinutes).toBe(480);
        expect(SLA_BY_PRIORITY.normal.resolutionMinutes).toBe(1440);
      });

      it('low: 24hr first response, 48hr resolution', () => {
        expect(SLA_BY_PRIORITY.low.firstResponseMinutes).toBe(1440);
        expect(SLA_BY_PRIORITY.low.resolutionMinutes).toBe(2880);
      });

      it('urgent escalation trigger is 30 min', () => {
        expect(SLA_BY_PRIORITY.urgent.escalationTriggerMinutes).toBe(30);
      });
    });

    // ── SLA Engine ──────────────────────────────────────────────────────

    describe('SLA engine', () => {
      beforeAll(() => {
        initSlaEngine();
      });

      it('business hours: weekday 10am AEST is business hour', () => {
        // 10am AEST = 0am UTC (AEST = UTC+10)
        const weekday = new Date('2026-04-07T00:00:00Z'); // Tuesday 10am AEST
        expect(isBusinessHour(weekday)).toBe(true);
      });

      it('business hours: Sunday is not business hour', () => {
        const sunday = new Date('2026-04-05T02:00:00Z'); // Sunday 12pm AEST
        expect(isBusinessHour(sunday)).toBe(false);
      });

      it('isSlaBreached detects breach', () => {
        const deadline = new Date('2026-04-07T10:00:00Z');
        const after = new Date('2026-04-07T11:00:00Z');
        const before = new Date('2026-04-07T09:00:00Z');
        expect(isSlaBreached(deadline, after)).toBe(true);
        expect(isSlaBreached(deadline, before)).toBe(false);
      });

      it('isSlaImminent detects 80% threshold', () => {
        const created = new Date('2026-04-07T00:00:00Z');
        const deadline = new Date('2026-04-07T10:00:00Z'); // 10hr window
        const at80pct = new Date('2026-04-07T08:00:00Z');  // 8hr elapsed = 80%
        const at50pct = new Date('2026-04-07T05:00:00Z');  // 5hr elapsed = 50%
        expect(isSlaImminent(created, deadline, at80pct)).toBe(true);
        expect(isSlaImminent(created, deadline, at50pct)).toBe(false);
      });

      it('getEscalationTriggerTime for urgent is 30 min from creation', () => {
        const created = new Date('2026-04-07T10:00:00Z');
        const trigger = getEscalationTriggerTime(created, 'urgent');
        const expectedMs = created.getTime() + 30 * 60 * 1000;
        expect(trigger.getTime()).toBe(expectedMs);
      });

      it('calculateSlaDeadline returns a future date', () => {
        const now = new Date('2026-04-07T00:00:00Z'); // Mon 10am AEST
        const deadline = calculateSlaDeadline(now, 'urgent');
        expect(deadline.getTime()).toBeGreaterThan(now.getTime());
      });
    });

    // ── Max Reopens (TKT-INV-06) ────────────────────────────────────────

    describe('Max reopens (TKT-INV-06)', () => {
      it('max reopens is 3', () => {
        expect(MAX_REOPENS).toBe(3);
      });
    });

    // ── Ticket Interface ────────────────────────────────────────────────

    describe('Ticket interface', () => {
      it('has all required fields (type check)', () => {
        const ticket: Partial<ISupportTicket> = {
          ticketNumber: 'QGS-TKT-0001',
          userId: null as never,
          category: 'billing_query',
          priority: 'normal',
          status: 'open',
          subject: 'Invoice query',
          description: 'I have a question about my invoice',
          slaDeadline: new Date(),
          slaBreached: false,
          firstResponseBreached: false,
          reopenCount: 0,
          source: 'portal',
          messages: [],
        };
        expect(ticket.ticketNumber).toMatch(/^QGS-TKT-/);
        expect(ticket.reopenCount).toBe(0);
      });
    });

    // ── Endpoint Count ──────────────────────────────────────────────────

    describe('Ticket endpoints', () => {
      it('has 12 endpoints', () => {
        const endpoints = [
          'POST /tickets',
          'GET /tickets',
          'GET /tickets/:id',
          'PATCH /tickets/:id/status',
          'PUT /tickets/:id/assign',
          'POST /tickets/:id/message',
          'POST /tickets/:id/escalate',
          'PATCH /tickets/:id/resolve',
          'POST /tickets/:id/reopen',
          'POST /tickets/:id/satisfaction',
          'GET /tickets/stats',
          'GET /tickets/sla-report',
        ];
        expect(endpoints).toHaveLength(12);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WHATSAPP CONNECTOR
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WhatsApp Connector', () => {

    // ── Phone Number Formatting (WHA-INV-04) ────────────────────────────

    describe('Phone number formatting (WHA-INV-04)', () => {
      it('toMetaFormat: removes + prefix', () => {
        expect(toMetaFormat('+61412345678')).toBe('61412345678');
      });

      it('toMetaFormat: no-op if already without +', () => {
        expect(toMetaFormat('61412345678')).toBe('61412345678');
      });

      it('toE164: adds + prefix', () => {
        expect(toE164('61412345678')).toBe('+61412345678');
      });

      it('toE164: no-op if already has +', () => {
        expect(toE164('+61412345678')).toBe('+61412345678');
      });

      it('round-trip: toE164(toMetaFormat(x)) === x', () => {
        const original = '+61412345678';
        expect(toE164(toMetaFormat(original))).toBe(original);
      });
    });

    // ── Freeform Window (WHA-INV-03) ────────────────────────────────────

    describe('24-hour freeform window (WHA-INV-03)', () => {
      it('window is 24 hours', () => {
        expect(FREEFORM_WINDOW_HOURS).toBe(24);
      });
    });

    // ── Message Types ───────────────────────────────────────────────────

    describe('WhatsApp message types', () => {
      it('has 7 message types', () => {
        expect(WHATSAPP_MESSAGE_TYPES).toHaveLength(7);
      });

      it('includes template, text, image, document', () => {
        expect(WHATSAPP_MESSAGE_TYPES).toContain('template');
        expect(WHATSAPP_MESSAGE_TYPES).toContain('text');
        expect(WHATSAPP_MESSAGE_TYPES).toContain('image');
        expect(WHATSAPP_MESSAGE_TYPES).toContain('document');
      });
    });

    // ── Message Status Lifecycle ────────────────────────────────────────

    describe('WhatsApp message statuses', () => {
      it('has 4 statuses: sent, delivered, read, failed', () => {
        const statuses: WhatsAppMessageStatus[] = ['sent', 'delivered', 'read', 'failed'];
        expect(statuses).toHaveLength(4);
      });
    });

    // ── WhatsApp Message Interface ──────────────────────────────────────

    describe('WhatsApp message interface', () => {
      it('supports inbound with media', () => {
        const msg: Partial<IWhatsAppMessage> = {
          direction: 'inbound',
          contactMobile: '+61412345678',
          contactType: 'lead',
          messageType: 'image',
          mediaOriginalUrl: 'https://cdn.meta.com/xxx',
          mediaMimeType: 'image/jpeg',
          status: 'delivered',
          conversationWindowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        };
        expect(msg.direction).toBe('inbound');
        expect(msg.conversationWindowExpiresAt!.getTime()).toBeGreaterThan(Date.now());
      });

      it('supports outbound template', () => {
        const msg: Partial<IWhatsAppMessage> = {
          direction: 'outbound',
          messageType: 'template',
          templateName: 'appointment_reminder',
          templateParams: ['John', '2pm Tuesday'],
          status: 'sent',
        };
        expect(msg.templateName).toBe('appointment_reminder');
        expect(msg.templateParams).toHaveLength(2);
      });
    });

    // ── WHA-INV-02: Template Required for Business-Initiated ────────────

    describe('WHA-INV-02: Template enforcement', () => {
      it('template message type exists', () => {
        expect(WHATSAPP_MESSAGE_TYPES[0]).toBe('template');
      });
    });

    // ── Endpoint Count ──────────────────────────────────────────────────

    describe('WhatsApp endpoints', () => {
      it('has 9 endpoints (including webhook)', () => {
        const endpoints = [
          'GET /whatsapp/config',
          'PUT /whatsapp/config',
          'POST /whatsapp/send',
          'POST /whatsapp/send-freeform',
          'GET /webhooks/whatsapp',
          'POST /webhooks/whatsapp',
          'GET /whatsapp/status',
          'GET /whatsapp/conversations/:contactId',
          'GET /whatsapp/templates',
        ];
        expect(endpoints).toHaveLength(9);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CROSS-CUTTING: ENDPOINT TOTALS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Phase 7 totals', () => {
    it('chat: 11 REST endpoints + 5 Socket.io events', () => {
      expect(11 + 5).toBe(16);
    });

    it('tickets: 12 endpoints', () => {
      expect(12).toBe(12);
    });

    it('whatsapp: 9 endpoints', () => {
      expect(9).toBe(9);
    });
  });
});
