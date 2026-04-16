/**
 * Form Mapping — Unit Tests
 *
 * These tests cover:
 *   - FY format validation
 *   - Meta-schema validator: valid schema passes, broken variants fail with
 *     the specific error codes the admin UI relies on
 *   - QETAX default seed schema validates clean (guards against drift)
 *
 * Service-level lifecycle invariants (DRAFT_EXISTS, DEFAULT_LOCKED, etc.) are
 * covered implicitly by the E2E suite via the admin UI + live API since the
 * repo's Jest setup does not wire mongodb-memory-server. See
 * /Users/lovishmahajan/.claude/plans/glowing-frolicking-bunny.md §Verification
 * for the manual E2E checklist.
 */

import {
  isValidFinancialYear,
  FORM_MAPPING_WIDGETS,
  FORM_MAPPING_ERROR_CODES,
} from '../src/modules/form-mapping/formMapping.types';
import { validateAuthoredSchema } from '../src/modules/form-mapping/formMapping.schema';
import { QETAX_DEFAULT_SCHEMA } from '../src/modules/form-mapping/formMapping.seed';

describe('Form Mapping — Types', () => {
  describe('isValidFinancialYear', () => {
    it('accepts 2025-2026', () => {
      expect(isValidFinancialYear('2025-2026')).toBe(true);
    });
    it('accepts 2024-2025', () => {
      expect(isValidFinancialYear('2024-2025')).toBe(true);
    });
    it('rejects 2025-2027 (non-contiguous)', () => {
      expect(isValidFinancialYear('2025-2027')).toBe(false);
    });
    it('rejects 25-26 (short form)', () => {
      expect(isValidFinancialYear('25-26')).toBe(false);
    });
    it('rejects empty string', () => {
      expect(isValidFinancialYear('')).toBe(false);
    });
  });

  describe('FORM_MAPPING_WIDGETS', () => {
    it('includes all 10 widgets', () => {
      expect(FORM_MAPPING_WIDGETS).toHaveLength(10);
      expect(FORM_MAPPING_WIDGETS).toContain('text');
      expect(FORM_MAPPING_WIDGETS).toContain('currency');
      expect(FORM_MAPPING_WIDGETS).toContain('file_upload');
    });
  });

  describe('FORM_MAPPING_ERROR_CODES', () => {
    it('has all lifecycle error codes', () => {
      expect(FORM_MAPPING_ERROR_CODES.DRAFT_EXISTS).toBe('DRAFT_EXISTS');
      expect(FORM_MAPPING_ERROR_CODES.VERSION_PUBLISHED).toBe('VERSION_PUBLISHED');
      expect(FORM_MAPPING_ERROR_CODES.DEFAULT_LOCKED).toBe('DEFAULT_LOCKED');
      expect(FORM_MAPPING_ERROR_CODES.NOT_DELETABLE).toBe('NOT_DELETABLE');
    });
  });
});

// ─── Helper: a minimal valid schema ─────────────────────────────────────

const minimalValid = (): Record<string, unknown> => ({
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  title: 'Minimal',
  'x-qegos': { steps: ['one'] },
  properties: {
    one: {
      type: 'object',
      title: 'Step One',
      'x-qegos': { stepId: 'one' },
      properties: {
        first_name: {
          type: 'string',
          title: 'First Name',
          'x-qegos': { fieldKey: 'first_name', widget: 'text' },
        },
      },
      required: ['first_name'],
    },
  },
  required: ['one'],
});

describe('Form Mapping — Authored Schema Validator', () => {
  describe('happy path', () => {
    it('accepts a minimal well-formed schema', () => {
      const result = validateAuthoredSchema(minimalValid());
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.steps).toEqual(['one']);
      expect(result.fieldKeys).toEqual(['first_name']);
    });

    it('accepts the seeded QETAX canonical schema', () => {
      const result = validateAuthoredSchema(QETAX_DEFAULT_SCHEMA);
      if (!result.valid) {
        // Surface the actual errors for faster debugging if this regresses
        // eslint-disable-next-line no-console
        console.error('QETAX schema validation issues:', result.issues);
      }
      expect(result.valid).toBe(true);
      expect(result.steps).toContain('personal_details');
      expect(result.steps).toContain('consent');
      expect(result.fieldKeys).toContain('first_name');
      expect(result.fieldKeys).toContain('tfn_abn_acn');
      expect(result.fieldKeys).toContain('consent_agreement');
    });
  });

  describe('structural failures', () => {
    it('rejects a non-object root', () => {
      const result = validateAuthoredSchema('not an object');
      expect(result.valid).toBe(false);
      expect(result.issues[0]?.code).toBe('NOT_AN_OBJECT');
    });

    it('rejects root type !== object', () => {
      const s = minimalValid();
      s.type = 'string';
      const result = validateAuthoredSchema(s);
      expect(result.valid).toBe(false);
      expect(result.issues.find((i) => i.code === 'ROOT_NOT_OBJECT')).toBeTruthy();
    });

    it('rejects missing x-qegos.steps', () => {
      const s = minimalValid();
      delete (s['x-qegos'] as Record<string, unknown>).steps;
      const result = validateAuthoredSchema(s);
      expect(result.valid).toBe(false);
      expect(result.issues.find((i) => i.code === 'MISSING_STEPS')).toBeTruthy();
    });

    it('flags steps/properties mismatch', () => {
      const s = minimalValid();
      (s['x-qegos'] as Record<string, unknown>).steps = ['one', 'two'];
      // "two" is not in properties
      const result = validateAuthoredSchema(s);
      expect(result.valid).toBe(false);
      expect(result.issues.find((i) => i.code === 'STEP_NOT_IN_PROPERTIES')).toBeTruthy();
    });

    it('flags a property not declared as a step', () => {
      const s = minimalValid();
      (s.properties as Record<string, unknown>).rogue = {
        type: 'object',
        properties: {},
      };
      const result = validateAuthoredSchema(s);
      expect(result.valid).toBe(false);
      expect(result.issues.find((i) => i.code === 'PROPERTY_NOT_IN_STEPS')).toBeTruthy();
    });
  });

  describe('field-level failures', () => {
    it('rejects a missing fieldKey', () => {
      const s = minimalValid();
      const field = ((s.properties as Record<string, unknown>).one as Record<string, unknown>)
        .properties as Record<string, Record<string, unknown>>;
      delete (field.first_name as Record<string, unknown>)['x-qegos'];
      const result = validateAuthoredSchema(s);
      expect(result.valid).toBe(false);
      expect(result.issues.find((i) => i.code === 'MISSING_FIELD_KEY')).toBeTruthy();
    });

    it('rejects a duplicate fieldKey across two steps', () => {
      const s = minimalValid();
      (s['x-qegos'] as Record<string, unknown>).steps = ['one', 'two'];
      (s.properties as Record<string, unknown>).two = {
        type: 'object',
        title: 'Step Two',
        'x-qegos': { stepId: 'two' },
        properties: {
          first_name: {
            type: 'string',
            title: 'Dupe',
            'x-qegos': { fieldKey: 'first_name', widget: 'text' },
          },
        },
      };
      const result = validateAuthoredSchema(s);
      expect(result.valid).toBe(false);
      expect(result.issues.find((i) => i.code === 'DUPLICATE_FIELD_KEY')).toBeTruthy();
    });

    it('rejects an invalid fieldKey shape (camelCase)', () => {
      const s = minimalValid();
      const one = (s.properties as Record<string, unknown>).one as Record<string, unknown>;
      const props = one.properties as Record<string, Record<string, unknown>>;
      const field = props.first_name as Record<string, unknown>;
      (field['x-qegos'] as Record<string, unknown>).fieldKey = 'firstName';
      const result = validateAuthoredSchema(s);
      expect(result.valid).toBe(false);
      expect(result.issues.find((i) => i.code === 'INVALID_FIELD_KEY')).toBeTruthy();
    });

    it('rejects an unknown widget', () => {
      const s = minimalValid();
      const one = (s.properties as Record<string, unknown>).one as Record<string, unknown>;
      const props = one.properties as Record<string, Record<string, unknown>>;
      const field = props.first_name as Record<string, unknown>;
      (field['x-qegos'] as Record<string, unknown>).widget = 'slider_with_rainbow';
      const result = validateAuthoredSchema(s);
      expect(result.valid).toBe(false);
      expect(result.issues.find((i) => i.code === 'UNKNOWN_WIDGET')).toBeTruthy();
    });

    it('rejects widget/type mismatch (currency on a string)', () => {
      const s = minimalValid();
      const one = (s.properties as Record<string, unknown>).one as Record<string, unknown>;
      const props = one.properties as Record<string, Record<string, unknown>>;
      const field = props.first_name as Record<string, unknown>;
      (field['x-qegos'] as Record<string, unknown>).widget = 'currency';
      // field.type is still "string"
      const result = validateAuthoredSchema(s);
      expect(result.valid).toBe(false);
      expect(result.issues.find((i) => i.code === 'WIDGET_TYPE_MISMATCH')).toBeTruthy();
    });

    it('rejects a step with no properties', () => {
      const s = minimalValid();
      const one = (s.properties as Record<string, unknown>).one as Record<string, unknown>;
      delete one.properties;
      const result = validateAuthoredSchema(s);
      expect(result.valid).toBe(false);
      expect(result.issues.find((i) => i.code === 'STEP_MISSING_PROPERTIES')).toBeTruthy();
    });
  });
});
