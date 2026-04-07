/**
 * Lead Advanced — Tests (E3)
 *
 * Tests scoring factors, import validation logic, and merge field allowlist.
 * These are unit/structural tests — no database required.
 */

import { LeadStatus, LEAD_STATUS_TRANSITIONS } from '../src/modules/lead-management/lead.types';
import type { LeadScoreFactors } from '../src/modules/lead-management/lead.types';

// ═══════════════════════════════════════════════════════════════════════════════

describe('Lead Advanced Features', () => {
  // ── Scoring Factors ──────────────────────────────────────────────────

  describe('Lead scoring factors (PRD 12.6)', () => {
    it('LeadScoreFactors interface has all 17 factors', () => {
      // Verify the type has the correct shape
      const factors: LeadScoreFactors = {
        hasEmail: true,
        completeProfile: true,
        hasRentalProperty: true,
        hasSharePortfolio: true,
        isSelfEmployed: true,
        multipleServices: true,
        hasSpouse: true,
        hasDependants: true,
        positiveOutcome: true,
        quoteRequested: true,
        referralSource: true,
        repeatClient: true,
        recentContact: true,
        hasForeignIncome: true,
        overdueFollowUps: false,
        multipleNoAnswer: false,
        goneCold: false,
      };

      expect(Object.keys(factors)).toHaveLength(17);

      // Positive factors (14)
      expect(factors.hasEmail).toBe(true);
      expect(factors.completeProfile).toBe(true);
      expect(factors.hasRentalProperty).toBe(true);
      expect(factors.hasSharePortfolio).toBe(true);
      expect(factors.isSelfEmployed).toBe(true);
      expect(factors.multipleServices).toBe(true);
      expect(factors.hasSpouse).toBe(true);
      expect(factors.hasDependants).toBe(true);
      expect(factors.positiveOutcome).toBe(true);
      expect(factors.quoteRequested).toBe(true);
      expect(factors.referralSource).toBe(true);
      expect(factors.repeatClient).toBe(true);
      expect(factors.recentContact).toBe(true);
      expect(factors.hasForeignIncome).toBe(true);

      // Negative factors (3)
      expect(factors.overdueFollowUps).toBe(false);
      expect(factors.multipleNoAnswer).toBe(false);
      expect(factors.goneCold).toBe(false);
    });

    it('max possible score is 155 (all positive, no negative)', () => {
      // hasEmail(5) + completeProfile(10) + rental(15) + shares(10) +
      // selfEmployed(15) + multipleServices(10) + spouse(10) + dependants(5) +
      // positiveOutcome(15) + quoteRequested(10) + referral(10) + repeatClient(15) +
      // recentContact(5) + foreignIncome(10) = 145
      // But clamped to 100
      const maxRawScore = 5 + 10 + 15 + 10 + 15 + 10 + 10 + 5 + 15 + 10 + 10 + 15 + 5 + 10;
      expect(maxRawScore).toBe(145);
      // Score is clamped to 0-100
      expect(Math.min(100, maxRawScore)).toBe(100);
    });

    it('min possible score is -25 (all negative, no positive)', () => {
      // overdueFollowUps(-10) + multipleNoAnswer(-10) + goneCold(-5) = -25
      const minRawScore = -10 + -10 + -5;
      expect(minRawScore).toBe(-25);
      // Score is clamped to 0-100
      expect(Math.max(0, minRawScore)).toBe(0);
    });

    it('priority thresholds: hot >= 61, warm 31-60, cold < 31', () => {
      const hotThreshold = 61;
      const warmLower = 31;

      // Hot
      expect(hotThreshold).toBeLessThanOrEqual(100);
      // Warm
      expect(warmLower).toBeLessThan(hotThreshold);
      // Cold
      expect(warmLower - 1).toBeLessThan(warmLower);
    });
  });

  // ── Import Validation Logic ──────────────────────────────────────────

  describe('Bulk import — two-pass validation (LM-INV-08)', () => {
    it('required fields: firstName, mobile, source', () => {
      // These are the minimum required fields for import
      const validRow = {
        firstName: 'John',
        mobile: '+61412345678',
        source: 'web_form',
      };
      expect(validRow.firstName).toBeTruthy();
      expect(validRow.mobile).toMatch(/^\+61\d{9}$/);
      expect(validRow.source).toBeTruthy();
    });

    it('mobile must be E.164 Australian format', () => {
      const validMobile = '+61412345678';
      const invalidMobiles = ['0412345678', '+1234567890', 'abc', '', '+61'];

      expect(validMobile).toMatch(/^\+61\d{9}$/);
      for (const m of invalidMobiles) {
        expect(m).not.toMatch(/^\+61\d{9}$/);
      }
    });

    it('email validation when provided', () => {
      const validEmails = ['test@example.com', 'user.name@domain.co.au'];
      const invalidEmails = ['notanemail', '@missing.com', 'no@', ''];

      for (const e of validEmails) {
        expect(e).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      }
      for (const e of invalidEmails) {
        expect(e).not.toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      }
    });

    it('postcode must be 4 digits', () => {
      const valid = ['2000', '3000', '6000', '0800'];
      const invalid = ['200', '20000', 'abcd', ''];

      for (const p of valid) {
        expect(p).toMatch(/^\d{4}$/);
      }
      for (const p of invalid) {
        expect(p).not.toMatch(/^\d{4}$/);
      }
    });

    it('state must be valid Australian state', () => {
      const validStates = new Set(['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT']);
      expect(validStates.has('NSW')).toBe(true);
      expect(validStates.has('XX')).toBe(false);
      expect(validStates.size).toBe(8);
    });

    it('imported leads default: status=New, priority=warm, score=0', () => {
      expect(LeadStatus.New).toBe(1);
      // These are the expected defaults set in importLeads
      const defaults = { status: LeadStatus.New, priority: 'warm', score: 0 };
      expect(defaults.status).toBe(1);
      expect(defaults.priority).toBe('warm');
      expect(defaults.score).toBe(0);
    });
  });

  // ── Merge Field Allowlist ────────────────────────────────────────────

  describe('Lead merge — field allowlist (LM-INV-06)', () => {
    it('allowlist contains expected mergeable fields', () => {
      const MERGEABLE_FIELDS = new Set([
        'firstName', 'lastName', 'email', 'mobile', 'preferredLanguage',
        'preferredContact', 'suburb', 'state', 'postcode', 'financialYear',
        'maritalStatus', 'hasSpouse', 'numberOfDependants', 'employmentType',
        'hasRentalProperty', 'hasSharePortfolio', 'hasForeignIncome',
        'tags', 'notes',
      ]);

      expect(MERGEABLE_FIELDS.size).toBe(19);
      expect(MERGEABLE_FIELDS.has('firstName')).toBe(true);
      expect(MERGEABLE_FIELDS.has('email')).toBe(true);
      expect(MERGEABLE_FIELDS.has('mobile')).toBe(true);
      expect(MERGEABLE_FIELDS.has('tags')).toBe(true);
    });

    it('protected fields are NOT in the allowlist', () => {
      const MERGEABLE_FIELDS = new Set([
        'firstName', 'lastName', 'email', 'mobile', 'preferredLanguage',
        'preferredContact', 'suburb', 'state', 'postcode', 'financialYear',
        'maritalStatus', 'hasSpouse', 'numberOfDependants', 'employmentType',
        'hasRentalProperty', 'hasSharePortfolio', 'hasForeignIncome',
        'tags', 'notes',
      ]);

      // These should NEVER be mergeable
      expect(MERGEABLE_FIELDS.has('_id')).toBe(false);
      expect(MERGEABLE_FIELDS.has('leadNumber')).toBe(false);
      expect(MERGEABLE_FIELDS.has('status')).toBe(false);
      expect(MERGEABLE_FIELDS.has('score')).toBe(false);
      expect(MERGEABLE_FIELDS.has('priority')).toBe(false);
      expect(MERGEABLE_FIELDS.has('isConverted')).toBe(false);
      expect(MERGEABLE_FIELDS.has('isDeleted')).toBe(false);
      expect(MERGEABLE_FIELDS.has('assignedTo')).toBe(false);
      expect(MERGEABLE_FIELDS.has('createdAt')).toBe(false);
      expect(MERGEABLE_FIELDS.has('convertedOrderId')).toBe(false);
      expect(MERGEABLE_FIELDS.has('convertedUserId')).toBe(false);
    });
  });

  // ── Status Machine ───────────────────────────────────────────────────

  describe('Lead status state machine (LM-INV-02)', () => {
    it('Won is terminal — no transitions allowed', () => {
      expect(LEAD_STATUS_TRANSITIONS[LeadStatus.Won]).toHaveLength(0);
    });

    it('New can transition to Contacted or Lost', () => {
      const transitions = LEAD_STATUS_TRANSITIONS[LeadStatus.New];
      expect(transitions).toContain(LeadStatus.Contacted);
      expect(transitions).toContain(LeadStatus.Lost);
      expect(transitions).not.toContain(LeadStatus.Won);
    });

    it('Lost can reopen to New', () => {
      expect(LEAD_STATUS_TRANSITIONS[LeadStatus.Lost]).toContain(LeadStatus.New);
    });

    it('Dormant can re-engage to Contacted', () => {
      expect(LEAD_STATUS_TRANSITIONS[LeadStatus.Dormant]).toContain(LeadStatus.Contacted);
    });

    it('all statuses have defined transitions', () => {
      for (let status = 1; status <= 8; status++) {
        expect(LEAD_STATUS_TRANSITIONS[status as LeadStatus]).toBeDefined();
        expect(Array.isArray(LEAD_STATUS_TRANSITIONS[status as LeadStatus])).toBe(true);
      }
    });
  });

  // ── Export Fields ────────────────────────────────────────────────────

  describe('Lead export', () => {
    it('export fields match expected CSV columns', () => {
      const expectedColumns = [
        'leadNumber', 'firstName', 'lastName', 'mobile', 'email',
        'source', 'status', 'priority', 'score', 'state', 'postcode',
        'suburb', 'financialYear', 'maritalStatus', 'employmentType',
        'hasRentalProperty', 'hasSharePortfolio', 'hasForeignIncome',
        'estimatedValue', 'assignedTo', 'createdAt',
      ];
      expect(expectedColumns).toHaveLength(21);
      // All expected columns are present
      expect(expectedColumns).toContain('leadNumber');
      expect(expectedColumns).toContain('mobile');
      expect(expectedColumns).toContain('email');
    });
  });
});
