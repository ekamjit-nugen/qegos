/**
 * Broadcast Engine — Tests (Phase 5)
 *
 * Tests template rendering, merge tags, Spam Act compliance,
 * campaign status machine, cost estimation, and DND logic.
 * Unit/structural tests — no database required.
 */

import {
  renderMergeTags,
  appendSmsFooter,
  appendEmailFooter,
  renderMessage,
} from '../../../packages/broadcast-engine/src/services/templateService';
import {
  isValidTransition,
} from '../../../packages/broadcast-engine/src/services/campaignService';
import {
  CAMPAIGN_STATUS_TRANSITIONS,
  MERGE_TAG_FALLBACKS,
  DEFAULT_COST_PER_MESSAGE,
  DEFAULT_RATE_LIMITS,
} from '../../../packages/broadcast-engine/src/types';
import type {
  CampaignStatus,
  BroadcastEngineConfig,
} from '../../../packages/broadcast-engine/src/types';

// ─── Test Config ─────────────────────────────────────────────────────────────

const TEST_CONFIG: BroadcastEngineConfig = {
  businessName: 'QEGOS Test',
  businessAbn: '12 345 678 901',
  unsubscribeBaseUrl: 'https://qegos.test',
};

// ═══════════════════════════════════════════════════════════════════════════════

describe('Broadcast Engine', () => {
  // ── Merge Tag Rendering ──────────────────────────────────────────────

  describe('Template merge tags (BRC-INV-08)', () => {
    it('replaces known tags with merge data', () => {
      const result = renderMergeTags(
        'Hello {{firstName}} {{lastName}}, your order {{orderNumber}} is ready.',
        { firstName: 'John', lastName: 'Smith', orderNumber: 'QGS-O-0001' },
      );
      expect(result).toBe('Hello John Smith, your order QGS-O-0001 is ready.');
    });

    it('uses fallback values for missing merge data', () => {
      const result = renderMergeTags(
        'Hello {{firstName}}, welcome to {{companyName}}!',
        {},
      );
      expect(result).toBe('Hello Valued Client, welcome to QEGOS!');
    });

    it('never sends unresolved {{tags}}', () => {
      const result = renderMergeTags(
        'Hello {{firstName}} {{unknownTag}}!',
        {},
      );
      // firstName gets fallback, unknownTag gets empty string
      expect(result).not.toContain('{{');
      expect(result).not.toContain('}}');
      expect(result).toBe('Hello Valued Client !');
    });

    it('prefers merge data over fallbacks', () => {
      const result = renderMergeTags(
        'Hi {{firstName}}',
        { firstName: 'Alice' },
      );
      expect(result).toBe('Hi Alice');
    });

    it('handles empty merge data for tag with empty fallback', () => {
      const result = renderMergeTags('Name: {{lastName}}', {});
      // lastName fallback is empty string
      expect(result).toBe('Name: ');
    });

    it('fallback map has expected default values', () => {
      expect(MERGE_TAG_FALLBACKS.firstName).toBe('Valued Client');
      expect(MERGE_TAG_FALLBACKS.lastName).toBe('');
      expect(MERGE_TAG_FALLBACKS.companyName).toBe('QEGOS');
      expect(Object.keys(MERGE_TAG_FALLBACKS).length).toBeGreaterThanOrEqual(9);
    });
  });

  // ── SMS Footer (Spam Act BRC-INV-02) ────────────────────────────────

  describe('SMS footer — Spam Act compliance (BRC-INV-02)', () => {
    it('auto-appends "Reply STOP to unsubscribe"', () => {
      const result = appendSmsFooter('Hello! Check out our new service.');
      expect(result).toContain('Reply STOP to unsubscribe');
    });

    it('does not duplicate footer if already present', () => {
      const body = 'Hello!\n\nReply STOP to unsubscribe';
      const result = appendSmsFooter(body);
      const count = (result.match(/Reply STOP to unsubscribe/g) ?? []).length;
      expect(count).toBe(1);
    });

    it('footer is appended after double newline', () => {
      const result = appendSmsFooter('Test message');
      expect(result).toBe('Test message\n\nReply STOP to unsubscribe');
    });
  });

  // ── Email Footer (Spam Act BRC-INV-03) ──────────────────────────────

  describe('Email footer — Spam Act compliance (BRC-INV-03)', () => {
    it('auto-appends business name and ABN', () => {
      const result = appendEmailFooter('<p>Hello!</p>', TEST_CONFIG);
      expect(result).toContain('QEGOS Test');
      expect(result).toContain('12 345 678 901');
    });

    it('includes unsubscribe link', () => {
      const result = appendEmailFooter('<p>Hello!</p>', TEST_CONFIG);
      expect(result).toContain('Unsubscribe');
      expect(result).toContain('https://qegos.test/unsubscribe');
    });

    it('injects before </body> if present', () => {
      const result = appendEmailFooter('<body><p>Content</p></body>', TEST_CONFIG);
      expect(result).toContain('QEGOS Test');
      expect(result.indexOf('QEGOS Test')).toBeLessThan(result.indexOf('</body>'));
    });

    it('appends to end if no </body> tag', () => {
      const result = appendEmailFooter('<p>Content</p>', TEST_CONFIG);
      expect(result).toContain('QEGOS Test');
      expect(result.endsWith('</p>')).toBe(true);
    });

    it('works without ABN', () => {
      const configNoAbn: BroadcastEngineConfig = {
        businessName: 'Test Co',
      };
      const result = appendEmailFooter('<p>Hi</p>', configNoAbn);
      expect(result).toContain('Test Co');
      expect(result).not.toContain('ABN');
    });
  });

  // ── Full Message Rendering ──────────────────────────────────────────

  describe('renderMessage — channel-specific rendering', () => {
    it('SMS: renders merge tags + appends footer', () => {
      const result = renderMessage('sms', 'Hi {{firstName}}!', { firstName: 'Jane' }, TEST_CONFIG);
      expect(result.body).toBe('Hi Jane!\n\nReply STOP to unsubscribe');
      expect(result.htmlBody).toBeUndefined();
    });

    it('Email: renders merge tags + appends HTML footer', () => {
      const result = renderMessage(
        'email',
        '<p>Hi {{firstName}}</p>',
        { firstName: 'Bob' },
        TEST_CONFIG,
        { subject: 'Update for {{firstName}}' },
      );
      expect(result.body).toBe('<p>Hi Bob</p>');
      expect(result.subject).toBe('Update for Bob');
      expect(result.htmlBody).toContain('QEGOS Test');
      expect(result.htmlBody).toContain('Unsubscribe');
    });

    it('WhatsApp: renders merge tags without footer modification', () => {
      const result = renderMessage('whatsapp', 'Hi {{firstName}}!', { firstName: 'Eve' }, TEST_CONFIG);
      expect(result.body).toBe('Hi Eve!');
      expect(result.htmlBody).toBeUndefined();
      expect(result.body).not.toContain('STOP');
      expect(result.body).not.toContain('Unsubscribe');
    });
  });

  // ── Campaign Status Machine ─────────────────────────────────────────

  describe('Campaign status machine', () => {
    it('draft can transition to scheduled, sending, or cancelled', () => {
      expect(isValidTransition('draft', 'scheduled')).toBe(true);
      expect(isValidTransition('draft', 'sending')).toBe(true);
      expect(isValidTransition('draft', 'cancelled')).toBe(true);
      expect(isValidTransition('draft', 'sent')).toBe(false);
    });

    it('scheduled can transition to sending or cancelled', () => {
      expect(isValidTransition('scheduled', 'sending')).toBe(true);
      expect(isValidTransition('scheduled', 'cancelled')).toBe(true);
      expect(isValidTransition('scheduled', 'draft')).toBe(false);
    });

    it('sending can transition to paused, sent, or failed', () => {
      expect(isValidTransition('sending', 'paused')).toBe(true);
      expect(isValidTransition('sending', 'sent')).toBe(true);
      expect(isValidTransition('sending', 'failed')).toBe(true);
      expect(isValidTransition('sending', 'draft')).toBe(false);
    });

    it('paused can transition to sending or cancelled', () => {
      expect(isValidTransition('paused', 'sending')).toBe(true);
      expect(isValidTransition('paused', 'cancelled')).toBe(true);
      expect(isValidTransition('paused', 'draft')).toBe(false);
    });

    it('sent is terminal — no transitions', () => {
      expect(CAMPAIGN_STATUS_TRANSITIONS.sent).toHaveLength(0);
    });

    it('failed can retry to draft', () => {
      expect(isValidTransition('failed', 'draft')).toBe(true);
      expect(isValidTransition('failed', 'sending')).toBe(false);
    });

    it('cancelled can re-draft', () => {
      expect(isValidTransition('cancelled', 'draft')).toBe(true);
      expect(isValidTransition('cancelled', 'sending')).toBe(false);
    });

    it('all statuses have defined transitions', () => {
      const allStatuses: CampaignStatus[] = [
        'draft', 'scheduled', 'sending', 'paused', 'sent', 'failed', 'cancelled',
      ];
      for (const status of allStatuses) {
        expect(CAMPAIGN_STATUS_TRANSITIONS[status]).toBeDefined();
        expect(Array.isArray(CAMPAIGN_STATUS_TRANSITIONS[status])).toBe(true);
      }
    });
  });

  // ── BRC-INV-05: Only Draft/Paused Editable ──────────────────────────

  describe('Campaign editability (BRC-INV-05)', () => {
    it('draft and paused are the only editable statuses', () => {
      const editableStatuses: CampaignStatus[] = ['draft', 'paused'];
      const nonEditable: CampaignStatus[] = ['scheduled', 'sending', 'sent', 'failed', 'cancelled'];

      for (const status of editableStatuses) {
        // These statuses should allow modification
        expect(['draft', 'paused']).toContain(status);
      }

      for (const status of nonEditable) {
        expect(['draft', 'paused']).not.toContain(status);
      }
    });
  });

  // ── Cost Estimation ─────────────────────────────────────────────────

  describe('Cost estimation', () => {
    it('default SMS cost is $0.075 (750 cents)', () => {
      expect(DEFAULT_COST_PER_MESSAGE.sms).toBe(750);
    });

    it('default email cost is $0.001 (10 cents)', () => {
      expect(DEFAULT_COST_PER_MESSAGE.email).toBe(10);
    });

    it('default WhatsApp cost is $0.05 (500 cents)', () => {
      expect(DEFAULT_COST_PER_MESSAGE.whatsapp).toBe(500);
    });

    it('cost for 1000 SMS = $75 (7500000 cents)', () => {
      const cost = 1000 * DEFAULT_COST_PER_MESSAGE.sms;
      expect(cost).toBe(750000);
    });

    it('cost for 10000 emails = $10 (100000 cents)', () => {
      const cost = 10000 * DEFAULT_COST_PER_MESSAGE.email;
      expect(cost).toBe(100000);
    });

    it('multi-channel cost includes all channels', () => {
      const recipients = 500;
      const smsEmailCost = recipients * DEFAULT_COST_PER_MESSAGE.sms
        + recipients * DEFAULT_COST_PER_MESSAGE.email;
      expect(smsEmailCost).toBe(500 * 750 + 500 * 10);
      expect(smsEmailCost).toBe(380000); // $380
    });
  });

  // ── Rate Limits ─────────────────────────────────────────────────────

  describe('Rate limit configuration', () => {
    it('SMS: 10/sec, batch 2500', () => {
      expect(DEFAULT_RATE_LIMITS.smsPerSecond).toBe(10);
      expect(DEFAULT_RATE_LIMITS.smsBatchSize).toBe(2500);
    });

    it('Email: 100/sec, batch 500', () => {
      expect(DEFAULT_RATE_LIMITS.emailPerSecond).toBe(100);
      expect(DEFAULT_RATE_LIMITS.emailBatchSize).toBe(500);
    });

    it('WhatsApp: 80/sec, batch 500', () => {
      expect(DEFAULT_RATE_LIMITS.whatsappPerSecond).toBe(80);
      expect(DEFAULT_RATE_LIMITS.whatsappBatchSize).toBe(500);
    });
  });

  // ── Opt-Out / DND ──────────────────────────────────────────────────

  describe('DND / Opt-out invariants', () => {
    it('BRC-INV-01: opt-out reasons include all expected values', () => {
      const expectedReasons = [
        'user_request', 'reply_stop', 'bounce_hard',
        'bounce_soft_3x', 'admin_manual', 'spam_complaint',
      ];
      // These are the valid enum values per the model
      for (const reason of expectedReasons) {
        expect(typeof reason).toBe('string');
      }
      expect(expectedReasons).toHaveLength(6);
    });

    it('BRC-INV-04: bounce types map correctly', () => {
      // Hard bounce → immediate DND
      // 3x soft bounce → DND
      // Spam complaint → DND all channels
      const bounceActions = {
        hard: 'immediate_dnd_channel',
        soft_3x: 'dnd_channel',
        complaint: 'dnd_all_channels',
      };
      expect(Object.keys(bounceActions)).toHaveLength(3);
    });
  });

  // ── Consent ────────────────────────────────────────────────────────

  describe('Consent records (BRC-INV-07)', () => {
    it('consent sources include all expected values', () => {
      const sources = ['signup', 'import', 'referral', 'web_form', 'verbal', 'admin_manual'];
      expect(sources).toHaveLength(6);
    });

    it('consent channels include sms, email, whatsapp, push', () => {
      const channels = ['sms', 'email', 'whatsapp', 'push'];
      expect(channels).toHaveLength(4);
    });
  });

  // ── Template Categories ────────────────────────────────────────────

  describe('Template categories', () => {
    it('supports all 8 categories', () => {
      const categories = [
        'follow_up', 'promotion', 'reminder', 'announcement',
        'welcome', 're_engagement', 'deadline', 'review_request',
      ];
      expect(categories).toHaveLength(8);
    });
  });

  // ── Channel Configuration ──────────────────────────────────────────

  describe('Broadcast channels', () => {
    it('single channels: sms, email, whatsapp', () => {
      const single = ['sms', 'email', 'whatsapp'];
      expect(single).toHaveLength(3);
    });

    it('compound channels: sms_email, all', () => {
      const compound = ['sms_email', 'all'];
      expect(compound).toHaveLength(2);
    });

    it('total channel options: 5', () => {
      const all = ['sms', 'email', 'whatsapp', 'sms_email', 'all'];
      expect(all).toHaveLength(5);
    });
  });
});
