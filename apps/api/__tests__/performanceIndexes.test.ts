/**
 * Performance Indexes — Tests
 *
 * Validates index definitions, naming conventions, and coverage
 * of critical query patterns. No database required.
 */

import { PERFORMANCE_INDEXES, type IndexDefinition } from '../src/database/ensureIndexes';

describe('Performance Indexes', () => {

  // ─── Structure ──────────────────────────────────────────────────────

  describe('Index Definitions Structure', () => {
    it('has at least 20 index definitions', () => {
      expect(PERFORMANCE_INDEXES.length).toBeGreaterThanOrEqual(20);
    });

    it('all definitions have required fields', () => {
      for (const def of PERFORMANCE_INDEXES) {
        expect(def.collection).toBeDefined();
        expect(typeof def.collection).toBe('string');
        expect(def.keys).toBeDefined();
        expect(Object.keys(def.keys).length).toBeGreaterThan(0);
        expect(def.reason).toBeDefined();
        expect(def.reason.length).toBeGreaterThan(10);
      }
    });

    it('all definitions have named indexes', () => {
      for (const def of PERFORMANCE_INDEXES) {
        expect(def.options?.name).toBeDefined();
        expect(def.options!.name!.startsWith('idx_')).toBe(true);
      }
    });

    it('all index names are unique', () => {
      const names = PERFORMANCE_INDEXES.map((d) => d.options?.name).filter(Boolean);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('all key values are valid MongoDB index types', () => {
      const validTypes = [1, -1, 'text'];
      for (const def of PERFORMANCE_INDEXES) {
        for (const [key, value] of Object.entries(def.keys)) {
          expect(validTypes).toContain(value);
        }
      }
    });
  });

  // ─── Collection Coverage ────────────────────────────────────────────

  describe('Collection Coverage', () => {
    const collections = new Set(PERFORMANCE_INDEXES.map((d) => d.collection));

    it('covers payments collection', () => {
      expect(collections.has('payments')).toBe(true);
    });

    it('covers orders collection', () => {
      expect(collections.has('orders')).toBe(true);
    });

    it('covers leads collection', () => {
      expect(collections.has('leads')).toBe(true);
    });

    it('covers leadactivities collection', () => {
      expect(collections.has('leadactivities')).toBe(true);
    });

    it('covers tax_year_summaries collection', () => {
      expect(collections.has('tax_year_summaries')).toBe(true);
    });

    it('covers reviewassignments collection', () => {
      expect(collections.has('reviewassignments')).toBe(true);
    });

    it('covers support_tickets collection', () => {
      expect(collections.has('support_tickets')).toBe(true);
    });

    it('covers auditlogs collection', () => {
      expect(collections.has('auditlogs')).toBe(true);
    });

    it('covers notifications collection', () => {
      expect(collections.has('notifications')).toBe(true);
    });

    it('covers vault_documents collection', () => {
      expect(collections.has('vault_documents')).toBe(true);
    });
  });

  // ─── Analytics Query Coverage ───────────────────────────────────────

  describe('Analytics Query Coverage', () => {
    const paymentIndexes = PERFORMANCE_INDEXES.filter((d) => d.collection === 'payments');
    const orderIndexes = PERFORMANCE_INDEXES.filter((d) => d.collection === 'orders');
    const leadIndexes = PERFORMANCE_INDEXES.filter((d) => d.collection === 'leads');

    it('payment indexes cover status+createdAt+amount (revenue aggregation)', () => {
      const covering = paymentIndexes.find((idx) =>
        idx.keys.status !== undefined && idx.keys.createdAt !== undefined && idx.keys.amount !== undefined,
      );
      expect(covering).toBeDefined();
    });

    it('payment indexes cover userId+status+amount (CLV aggregation)', () => {
      const covering = paymentIndexes.find((idx) =>
        idx.keys.userId !== undefined && idx.keys.status !== undefined && idx.keys.amount !== undefined,
      );
      expect(covering).toBeDefined();
    });

    it('payment indexes cover orderId+status+amount (channel ROI)', () => {
      const covering = paymentIndexes.find((idx) =>
        idx.keys.orderId !== undefined && idx.keys.status !== undefined && idx.keys.amount !== undefined,
      );
      expect(covering).toBeDefined();
    });

    it('order indexes cover status+isDeleted+createdAt (service mix, seasonal)', () => {
      const covering = orderIndexes.find((idx) =>
        idx.keys.status !== undefined && idx.keys.isDeleted !== undefined && idx.keys.createdAt !== undefined,
      );
      expect(covering).toBeDefined();
    });

    it('order indexes cover processingBy+status (staff benchmark)', () => {
      const covering = orderIndexes.find((idx) =>
        idx.keys.processingBy !== undefined && idx.keys.status !== undefined,
      );
      expect(covering).toBeDefined();
    });

    it('lead indexes cover status+isDeleted+createdAt (pipeline health)', () => {
      const covering = leadIndexes.find((idx) =>
        idx.keys.status !== undefined && idx.keys.isDeleted !== undefined && idx.keys.createdAt !== undefined,
      );
      expect(covering).toBeDefined();
    });

    it('lead indexes cover campaignId+isConverted (channel ROI)', () => {
      const covering = leadIndexes.find((idx) =>
        idx.keys.campaignId !== undefined && idx.keys.isConverted !== undefined,
      );
      expect(covering).toBeDefined();
    });
  });

  // ─── Compound Index Best Practices ──────────────────────────────────

  describe('Index Best Practices', () => {
    it('all indexes have at least 2 fields (compound)', () => {
      for (const def of PERFORMANCE_INDEXES) {
        expect(Object.keys(def.keys).length).toBeGreaterThanOrEqual(2);
      }
    });

    it('no duplicate field orderings within same collection', () => {
      const seen = new Map<string, string[]>();
      for (const def of PERFORMANCE_INDEXES) {
        const keyStr = JSON.stringify(def.keys);
        if (!seen.has(def.collection)) seen.set(def.collection, []);
        const existing = seen.get(def.collection)!;
        const isDuplicate = existing.includes(keyStr);
        if (isDuplicate) {
          fail(`Duplicate index in ${def.collection}: ${keyStr}`);
        }
        existing.push(keyStr);
      }
    });

    it('date fields are consistently directional (ascending or descending)', () => {
      const dateFields = ['createdAt', 'updatedAt', 'timestamp', 'resolvedAt', 'date'];
      for (const def of PERFORMANCE_INDEXES) {
        for (const [key, val] of Object.entries(def.keys)) {
          if (dateFields.includes(key)) {
            // Date fields should be either 1 or -1 (no text)
            expect([1, -1]).toContain(val);
          }
        }
      }
    });

    it('partial indexes have partialFilterExpression', () => {
      const partials = PERFORMANCE_INDEXES.filter(
        (d) => d.options?.partialFilterExpression,
      );
      for (const def of partials) {
        expect(Object.keys(def.options!.partialFilterExpression!).length).toBeGreaterThan(0);
      }
    });
  });

  // ─── Monetary Amount Fields ─────────────────────────────────────────

  describe('Covering Indexes for Amount Fields', () => {
    it('payment analytics indexes include amount for covering queries', () => {
      const paymentAnalytics = PERFORMANCE_INDEXES.filter(
        (d) => d.collection === 'payments' && d.reason.includes('Analytics'),
      );
      expect(paymentAnalytics.length).toBeGreaterThanOrEqual(3);

      for (const def of paymentAnalytics) {
        expect(def.keys.amount).toBe(1);
      }
    });
  });
});
