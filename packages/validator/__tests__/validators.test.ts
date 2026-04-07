import { isValidTfn, isValidAbn, escapeRegex } from '../src/validators';
import { AUSTRALIAN_STATES } from '../src/types';

describe('@nugen/validator', () => {
  describe('TFN validation (FIX B-4: check digit algorithm)', () => {
    it('should accept a valid TFN (check digit passes)', () => {
      // 123 456 782 is a valid TFN per ATO algorithm
      expect(isValidTfn('123 456 782')).toBe(true);
    });

    it('should accept valid TFN without spaces', () => {
      expect(isValidTfn('123456782')).toBe(true);
    });

    it('should reject TFN with invalid check digit', () => {
      // 000 000 000 — format valid but check digit fails
      expect(isValidTfn('000 000 000')).toBe(false);
    });

    it('should reject TFN with wrong length', () => {
      expect(isValidTfn('12345678')).toBe(false);
      expect(isValidTfn('1234567890')).toBe(false);
    });

    it('should reject TFN with non-numeric characters', () => {
      expect(isValidTfn('12A 456 782')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidTfn('')).toBe(false);
    });
  });

  describe('ABN validation (FIX B-5: check digit algorithm)', () => {
    it('should accept a valid ABN', () => {
      // 51 824 753 556 is a valid ABN (ABR example)
      expect(isValidAbn('51 824 753 556')).toBe(true);
    });

    it('should accept valid ABN without spaces', () => {
      expect(isValidAbn('51824753556')).toBe(true);
    });

    it('should reject ABN with invalid check digit', () => {
      expect(isValidAbn('00 000 000 000')).toBe(false);
    });

    it('should reject ABN with wrong length', () => {
      expect(isValidAbn('1234567890')).toBe(false);
      expect(isValidAbn('123456789012')).toBe(false);
    });
  });

  describe('escapeRegex (FIX S-6, B-25: prevent ReDoS)', () => {
    it('should escape all regex special characters', () => {
      const input = '(a+)+$';
      const escaped = escapeRegex(input);
      expect(escaped).toBe('\\(a\\+\\)\\+\\$');
    });

    it('should not modify normal strings', () => {
      expect(escapeRegex('hello world')).toBe('hello world');
    });

    it('should escape dots and asterisks', () => {
      expect(escapeRegex('file.*')).toBe('file\\.\\*');
    });

    it('should escape brackets and pipes', () => {
      expect(escapeRegex('[test]|{value}')).toBe('\\[test\\]\\|\\{value\\}');
    });

    it('should handle empty string', () => {
      expect(escapeRegex('')).toBe('');
    });
  });

  describe('Australian states', () => {
    it('should have all 8 states/territories', () => {
      expect(AUSTRALIAN_STATES).toHaveLength(8);
      expect(AUSTRALIAN_STATES).toContain('NSW');
      expect(AUSTRALIAN_STATES).toContain('VIC');
      expect(AUSTRALIAN_STATES).toContain('QLD');
      expect(AUSTRALIAN_STATES).toContain('SA');
      expect(AUSTRALIAN_STATES).toContain('WA');
      expect(AUSTRALIAN_STATES).toContain('TAS');
      expect(AUSTRALIAN_STATES).toContain('NT');
      expect(AUSTRALIAN_STATES).toContain('ACT');
    });
  });
});
