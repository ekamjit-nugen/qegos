import { calculateLineItemGST, calculateOrderGST } from '../src/utils/gstCalculator';

describe('GST Calculator', () => {
  describe('calculateLineItemGST — GST inclusive', () => {
    it('should calculate GST for $99 service (BIL-INV-01)', () => {
      // $99 = 9900 cents, GST = Math.round(9900/11) = 900 cents ($9.00)
      const result = calculateLineItemGST(9900, true);
      expect(result.gstAmountInCents).toBe(900);
      expect(result.priceExGstInCents).toBe(9000);
      expect(result.priceInCents).toBe(9900);
    });

    it('should calculate GST for $165 service (BIL-INV-01)', () => {
      // $165 = 16500 cents, GST = Math.round(16500/11) = 1500 cents ($15.00)
      const result = calculateLineItemGST(16500, true);
      expect(result.gstAmountInCents).toBe(1500);
      expect(result.priceExGstInCents).toBe(15000);
      expect(result.priceInCents).toBe(16500);
    });

    it('should return GST = 0 for $0 item', () => {
      const result = calculateLineItemGST(0, true);
      expect(result.gstAmountInCents).toBe(0);
      expect(result.priceExGstInCents).toBe(0);
      expect(result.priceInCents).toBe(0);
    });

    it('should handle rounding correctly for $1.10 (110 cents)', () => {
      // 110 / 11 = 10 exactly
      const result = calculateLineItemGST(110, true);
      expect(result.gstAmountInCents).toBe(10);
      expect(result.priceExGstInCents).toBe(100);
    });

    it('should round correctly for amounts that do not divide evenly', () => {
      // 100 / 11 = 9.09... → Math.round = 9
      const result = calculateLineItemGST(100, true);
      expect(result.gstAmountInCents).toBe(9);
      expect(result.priceExGstInCents).toBe(91);
    });
  });

  describe('calculateLineItemGST — GST exclusive', () => {
    it('should calculate GST on ex-GST price', () => {
      // $100 ex-GST = 10000 cents, GST = Math.round(10000/10) = 1000 cents
      const result = calculateLineItemGST(10000, false);
      expect(result.gstAmountInCents).toBe(1000);
      expect(result.priceExGstInCents).toBe(10000);
      expect(result.priceInCents).toBe(11000); // 10000 + 1000
    });

    it('should return GST = 0 for $0 ex-GST item', () => {
      const result = calculateLineItemGST(0, false);
      expect(result.gstAmountInCents).toBe(0);
    });
  });

  describe('calculateLineItemGST — validation', () => {
    it('should throw for negative amounts', () => {
      expect(() => calculateLineItemGST(-100, true)).toThrow('non-negative integer');
    });

    it('should throw for non-integer amounts', () => {
      expect(() => calculateLineItemGST(99.5, true)).toThrow('non-negative integer');
    });
  });

  describe('calculateOrderGST — multiple line items (BIL-INV-01)', () => {
    it('should sum per-item GST, NOT calculate on total', () => {
      // Per PRD example:
      // $99 → GST = 900
      // $165 → GST = 1500
      // Total GST = 900 + 1500 = 2400 (NOT Math.round(26400/11) = 2400, which coincidentally matches here)
      const result = calculateOrderGST([
        { description: 'Service A', priceInCents: 9900, quantity: 1, gstInclusive: true },
        { description: 'Service B', priceInCents: 16500, quantity: 1, gstInclusive: true },
      ]);

      expect(result.totalGstInCents).toBe(2400);
      expect(result.subtotalInCents).toBe(9000 + 15000); // ex-GST
      expect(result.grandTotalInCents).toBe(9900 + 16500);
    });

    it('should handle multiple quantities correctly', () => {
      // 2 x $99 items: each GST = 900, total GST = 1800
      const result = calculateOrderGST([
        { description: 'Service A', priceInCents: 9900, quantity: 2, gstInclusive: true },
      ]);

      expect(result.totalGstInCents).toBe(1800);
      expect(result.lineItems[0].gstAmountInCents).toBe(1800);
    });

    it('should handle zero-quantity items', () => {
      const result = calculateOrderGST([
        { description: 'Optional', priceInCents: 5000, quantity: 0, gstInclusive: true },
      ]);

      expect(result.totalGstInCents).toBe(0);
      expect(result.grandTotalInCents).toBe(0);
    });

    it('should handle mix of GST-inclusive and exclusive items', () => {
      const result = calculateOrderGST([
        { description: 'Inclusive', priceInCents: 11000, quantity: 1, gstInclusive: true },
        { description: 'Exclusive', priceInCents: 10000, quantity: 1, gstInclusive: false },
      ]);

      // Inclusive: 11000/11 = 1000 GST
      // Exclusive: 10000/10 = 1000 GST
      expect(result.totalGstInCents).toBe(2000);
    });

    it('should validate line item prices', () => {
      expect(() =>
        calculateOrderGST([
          { description: 'Bad', priceInCents: -100, quantity: 1, gstInclusive: true },
        ]),
      ).toThrow('non-negative integer');
    });
  });
});
