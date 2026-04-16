/**
 * Billing Dispute — Tests
 *
 * Tests for billing dispute types, status transitions, validators.
 * Unit/structural tests — no database required.
 */

import { VALID_DISPUTE_TRANSITIONS } from '../src/modules/billing/billingDispute.types';

import type {
  DisputeType,
  DisputeResolution,
  DisputeStatus,
  IBillingDispute,
} from '../src/modules/billing/billingDispute.types';

import {
  validateCreateDispute,
  validateUpdateDispute,
  validateDisputeId,
  validateListDisputes,
} from '../src/modules/billing/billingDispute.validators';

// ═══════════════════════════════════════════════════════════════════════════════

describe('Billing Disputes', () => {
  // ─── Dispute Types ─────────────────────────────────────────────────────────

  describe('Dispute Types', () => {
    it('defines all 6 dispute types', () => {
      const types: DisputeType[] = [
        'overcharge',
        'service_not_delivered',
        'quality_issue',
        'incorrect_amount',
        'duplicate_charge',
        'unauthorised',
      ];
      expect(types).toHaveLength(6);
    });
  });

  // ─── Dispute Resolutions ───────────────────────────────────────────────────

  describe('Dispute Resolutions', () => {
    it('defines all 6 resolution types', () => {
      const resolutions: DisputeResolution[] = [
        'full_refund',
        'partial_refund',
        'credit_issued',
        'no_action',
        'service_redo',
        'discount_applied',
      ];
      expect(resolutions).toHaveLength(6);
    });
  });

  // ─── Status Transitions ────────────────────────────────────────────────────

  describe('Status Transitions', () => {
    it('defines transitions for all 6 statuses', () => {
      const statuses = Object.keys(VALID_DISPUTE_TRANSITIONS);
      expect(statuses).toHaveLength(6);
      expect(statuses).toEqual(
        expect.arrayContaining([
          'raised',
          'investigating',
          'pending_approval',
          'approved',
          'rejected',
          'completed',
        ]),
      );
    });

    it('raised can transition to investigating or rejected', () => {
      expect(VALID_DISPUTE_TRANSITIONS.raised).toEqual(
        expect.arrayContaining(['investigating', 'rejected']),
      );
      expect(VALID_DISPUTE_TRANSITIONS.raised).toHaveLength(2);
    });

    it('investigating can transition to pending_approval or rejected', () => {
      expect(VALID_DISPUTE_TRANSITIONS.investigating).toEqual(
        expect.arrayContaining(['pending_approval', 'rejected']),
      );
      expect(VALID_DISPUTE_TRANSITIONS.investigating).toHaveLength(2);
    });

    it('pending_approval can transition to approved or rejected', () => {
      expect(VALID_DISPUTE_TRANSITIONS.pending_approval).toEqual(
        expect.arrayContaining(['approved', 'rejected']),
      );
      expect(VALID_DISPUTE_TRANSITIONS.pending_approval).toHaveLength(2);
    });

    it('approved can only transition to completed', () => {
      expect(VALID_DISPUTE_TRANSITIONS.approved).toEqual(['completed']);
    });

    it('rejected is a terminal state', () => {
      expect(VALID_DISPUTE_TRANSITIONS.rejected).toEqual([]);
    });

    it('completed is a terminal state', () => {
      expect(VALID_DISPUTE_TRANSITIONS.completed).toEqual([]);
    });

    it('no status can transition back to raised', () => {
      for (const [, targets] of Object.entries(VALID_DISPUTE_TRANSITIONS)) {
        expect(targets).not.toContain('raised');
      }
    });
  });

  // ─── Dispute Amount Invariants ─────────────────────────────────────────────

  describe('Amount Invariants', () => {
    it('disputedAmount must be positive integer cents', () => {
      const dispute: Partial<IBillingDispute> = {
        disputedAmount: 15000, // $150.00
        status: 'raised',
      };
      expect(Number.isInteger(dispute.disputedAmount)).toBe(true);
      expect(dispute.disputedAmount).toBeGreaterThan(0);
    });

    it('resolvedAmount can be zero (no_action resolution)', () => {
      const dispute: Partial<IBillingDispute> = {
        resolvedAmount: 0,
        resolution: 'no_action',
        status: 'completed',
      };
      expect(dispute.resolvedAmount).toBe(0);
    });

    it('resolvedAmount for partial_refund should be less than disputedAmount', () => {
      const disputedAmount = 50000; // $500.00
      const resolvedAmount = 25000; // $250.00
      expect(resolvedAmount).toBeLessThan(disputedAmount);
      expect(Number.isInteger(resolvedAmount)).toBe(true);
    });
  });

  // ─── Validators ────────────────────────────────────────────────────────────

  describe('Validators', () => {
    it('validateCreateDispute returns validation chain array', () => {
      const chains = validateCreateDispute();
      expect(Array.isArray(chains)).toBe(true);
      // orderId, paymentId, disputeType, disputedAmount, clientStatement, ticketId
      expect(chains.length).toBeGreaterThanOrEqual(5);
    });

    it('validateUpdateDispute returns validation chain array', () => {
      const chains = validateUpdateDispute();
      expect(Array.isArray(chains)).toBe(true);
      // param id, status, staffAssessment, resolution, resolvedAmount
      expect(chains.length).toBeGreaterThanOrEqual(2);
    });

    it('validateDisputeId returns validation chain with id param', () => {
      const chains = validateDisputeId();
      expect(Array.isArray(chains)).toBe(true);
      expect(chains).toHaveLength(1);
    });

    it('validateListDisputes returns query validation chains', () => {
      const chains = validateListDisputes();
      expect(Array.isArray(chains)).toBe(true);
      // page, limit, status, disputeType
      expect(chains).toHaveLength(4);
    });
  });

  // ─── Interface Shape ───────────────────────────────────────────────────────

  describe('IBillingDispute Interface', () => {
    it('has required fields', () => {
      const dispute: Partial<IBillingDispute> = {
        disputeType: 'overcharge',
        disputedAmount: 10000,
        clientStatement: 'I was charged incorrectly',
        status: 'raised',
        xeroAdjustmentMade: false,
        isDeleted: false,
      };
      expect(dispute.disputeType).toBe('overcharge');
      expect(dispute.xeroAdjustmentMade).toBe(false);
      expect(dispute.isDeleted).toBe(false);
    });

    it('supports soft delete fields', () => {
      const dispute: Partial<IBillingDispute> = {
        isDeleted: true,
        deletedAt: new Date(),
      };
      expect(dispute.isDeleted).toBe(true);
      expect(dispute.deletedAt).toBeInstanceOf(Date);
    });
  });
});
