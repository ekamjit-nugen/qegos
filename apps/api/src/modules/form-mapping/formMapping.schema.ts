/**
 * Form Mapping — Authored JSON Schema Meta-Validator
 *
 * This module exports `validateAuthoredSchema(schema)` which checks that a
 * super-admin-authored JSON blob is:
 *   1. A valid JSON Schema draft-07 document (AJV compile succeeds)
 *   2. Conforms to the QEGOS subset (steps, fields, fieldKey uniqueness,
 *      supported widgets, widget ↔ type compatibility)
 *
 * Violations are returned as a structured list of `{ path, message }` pairs
 * so the admin UI can surface them inline.
 */

import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import type { FormMappingSchema, FormMappingWidget } from './formMapping.types';
import { FORM_MAPPING_WIDGETS } from './formMapping.types';

// ─── Singleton AJV for drafts validation ──────────────────────────────────

const ajv = new Ajv({
  allErrors: true,
  strict: false, // We intentionally allow a few custom keywords (x-qegos, etc.)
  useDefaults: false,
  coerceTypes: false,
});
addFormats(ajv);

// ─── Errors returned from the validator ──────────────────────────────────

export interface SchemaValidationIssue {
  path: string; // JSON pointer-ish path into the authored document
  code: string;
  message: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  issues: SchemaValidationIssue[];
  steps: string[]; // ordered step ids, derived from x-qegos.steps
  fieldKeys: string[]; // flattened unique list of field keys
}

const FIELD_KEY_RE = /^[a-z][a-z0-9_]*$/;

type Obj = Record<string, unknown>;

function isObject(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) {
    return undefined;
  }
  if (!v.every((x) => typeof x === 'string')) {
    return undefined;
  }
  return v as string[];
}

/**
 * Check compatibility between an `x-qegos.widget` and the parent JSON Schema
 * `type`. If this returns a string, it's an error message.
 */
function widgetTypeMismatch(widget: FormMappingWidget, type: string | undefined): string | null {
  switch (widget) {
    case 'text':
    case 'textarea':
    case 'date':
    case 'select':
    case 'radio':
      return type === 'string'
        ? null
        : `widget "${widget}" requires type "string" (got "${String(type)}")`;
    case 'number':
    case 'currency':
      return type === 'number' || type === 'integer'
        ? null
        : `widget "${widget}" requires numeric type (got "${String(type)}")`;
    case 'checkbox':
      return type === 'boolean'
        ? null
        : `widget "checkbox" requires type "boolean" (got "${String(type)}")`;
    case 'multi_select':
      return type === 'array'
        ? null
        : `widget "multi_select" requires type "array" (got "${String(type)}")`;
    case 'file_upload':
      return type === 'string'
        ? null
        : `widget "file_upload" requires type "string" (got "${String(type)}")`;
    default:
      return `unknown widget "${String(widget)}"`;
  }
}

/**
 * Recursively walks a field subtree (leaves only — steps have already been
 * peeled off by the caller) and validates fieldKey uniqueness + widget type.
 */
function walkField(
  fieldKey: string,
  node: Obj,
  path: string,
  issues: SchemaValidationIssue[],
  seenFieldKeys: Set<string>,
): void {
  // fieldKey validity
  if (!FIELD_KEY_RE.test(fieldKey)) {
    issues.push({
      path,
      code: 'INVALID_FIELD_KEY',
      message: `fieldKey "${fieldKey}" must match /^[a-z][a-z0-9_]*$/`,
    });
  }
  if (seenFieldKeys.has(fieldKey)) {
    issues.push({
      path,
      code: 'DUPLICATE_FIELD_KEY',
      message: `fieldKey "${fieldKey}" is used more than once in this mapping`,
    });
  } else {
    seenFieldKeys.add(fieldKey);
  }

  // widget extraction
  const xq = isObject(node['x-qegos']) ? (node['x-qegos'] as Obj) : undefined;
  const widget = asString(xq?.widget) as FormMappingWidget | undefined;

  if (!widget) {
    issues.push({
      path,
      code: 'MISSING_WIDGET',
      message: `field "${fieldKey}" is missing x-qegos.widget`,
    });
    return;
  }
  if (!FORM_MAPPING_WIDGETS.includes(widget)) {
    issues.push({
      path,
      code: 'UNKNOWN_WIDGET',
      message: `field "${fieldKey}" has unknown widget "${widget}"`,
    });
    return;
  }

  const mismatch = widgetTypeMismatch(widget, asString(node['type']));
  if (mismatch) {
    issues.push({
      path,
      code: 'WIDGET_TYPE_MISMATCH',
      message: `field "${fieldKey}": ${mismatch}`,
    });
  }
}

/**
 * Extract the leaf field entries from a step. Nested objects are NOT
 * supported in Phase 1a (only top-level step.properties), so anything that
 * is itself an `object` inside a step is treated as a compound leaf with
 * its own fieldKey — we still walk children.
 */
function walkStep(
  stepId: string,
  step: Obj,
  issues: SchemaValidationIssue[],
  seenFieldKeys: Set<string>,
): void {
  const props = isObject(step['properties']) ? (step['properties'] as Obj) : undefined;
  if (!props) {
    issues.push({
      path: `/properties/${stepId}/properties`,
      code: 'STEP_MISSING_PROPERTIES',
      message: `step "${stepId}" must have a non-empty "properties" object`,
    });
    return;
  }

  for (const [propName, rawNode] of Object.entries(props)) {
    if (!isObject(rawNode)) {
      continue;
    }
    const node = rawNode;
    const path = `/properties/${stepId}/properties/${propName}`;

    // Compound sub-object (e.g. rentalProperty) — recurse but don't demand a fieldKey on the wrapper
    if (asString(node['type']) === 'object' && isObject(node['properties'])) {
      const inner = node['properties'] as Obj;
      for (const [innerName, innerRaw] of Object.entries(inner)) {
        if (!isObject(innerRaw)) {
          continue;
        }
        const innerNode = innerRaw as Obj;
        const innerPath = `${path}/properties/${innerName}`;
        const innerXq = isObject(innerNode['x-qegos']) ? (innerNode['x-qegos'] as Obj) : undefined;
        const innerKey = asString(innerXq?.fieldKey);
        if (!innerKey) {
          issues.push({
            path: innerPath,
            code: 'MISSING_FIELD_KEY',
            message: `nested field at ${innerPath} is missing x-qegos.fieldKey`,
          });
          continue;
        }
        walkField(innerKey, innerNode, innerPath, issues, seenFieldKeys);
      }
      // A compound wrapper may also carry its own fieldKey (optional)
      continue;
    }

    const xq = isObject(node['x-qegos']) ? (node['x-qegos'] as Obj) : undefined;
    const fieldKey = asString(xq?.fieldKey);
    if (!fieldKey) {
      issues.push({
        path,
        code: 'MISSING_FIELD_KEY',
        message: `field at ${path} is missing x-qegos.fieldKey`,
      });
      continue;
    }
    walkField(fieldKey, node, path, issues, seenFieldKeys);
  }
}

// ─── Public entrypoint ────────────────────────────────────────────────────

export function validateAuthoredSchema(schema: unknown): SchemaValidationResult {
  const issues: SchemaValidationIssue[] = [];
  const fieldKeys = new Set<string>();
  const steps: string[] = [];

  if (!isObject(schema)) {
    return {
      valid: false,
      issues: [{ path: '/', code: 'NOT_AN_OBJECT', message: 'Schema root must be an object' }],
      steps: [],
      fieldKeys: [],
    };
  }

  // 1. Top-level type must be object
  if (asString(schema['type']) !== 'object') {
    issues.push({
      path: '/type',
      code: 'ROOT_NOT_OBJECT',
      message: 'Root "type" must be "object"',
    });
  }

  // 2. x-qegos.steps present
  const rootXq = isObject(schema['x-qegos']) ? (schema['x-qegos'] as Obj) : undefined;
  if (!rootXq) {
    issues.push({
      path: '/x-qegos',
      code: 'MISSING_ROOT_EXTENSION',
      message: 'Root "x-qegos" object is required',
    });
  }
  const declaredSteps = asStringArray(rootXq?.steps);
  if (!declaredSteps || declaredSteps.length === 0) {
    issues.push({
      path: '/x-qegos/steps',
      code: 'MISSING_STEPS',
      message: 'Root x-qegos.steps must be a non-empty string array',
    });
  } else {
    steps.push(...declaredSteps);
  }

  // 3. properties keys must match declared steps (set equality, order from steps)
  const rootProps = isObject(schema['properties']) ? (schema['properties'] as Obj) : undefined;
  if (!rootProps) {
    issues.push({
      path: '/properties',
      code: 'MISSING_PROPERTIES',
      message: 'Root "properties" object is required',
    });
  } else if (declaredSteps) {
    const propKeys = new Set(Object.keys(rootProps));
    const stepSet = new Set(declaredSteps);
    for (const s of declaredSteps) {
      if (!propKeys.has(s)) {
        issues.push({
          path: `/properties/${s}`,
          code: 'STEP_NOT_IN_PROPERTIES',
          message: `step "${s}" declared in x-qegos.steps but missing from properties`,
        });
      }
    }
    for (const p of propKeys) {
      if (!stepSet.has(p)) {
        issues.push({
          path: `/properties/${p}`,
          code: 'PROPERTY_NOT_IN_STEPS',
          message: `properties has "${p}" which is not declared in x-qegos.steps`,
        });
      }
    }
  }

  // 4. Walk each step and collect field issues
  if (rootProps && declaredSteps) {
    for (const stepId of declaredSteps) {
      const rawStep = rootProps[stepId];
      if (!isObject(rawStep)) {
        continue;
      }
      walkStep(stepId, rawStep, issues, fieldKeys);
    }
  }

  // 5. Verify the document is a compile-able JSON Schema.
  // If it's structurally broken (e.g. `properties` is a string), AJV will throw.
  try {
    ajv.compile(schema as object);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    issues.push({
      path: '/',
      code: 'AJV_COMPILE_FAILED',
      message: `JSON Schema compile failed: ${msg}`,
    });
  }

  return {
    valid: issues.length === 0,
    issues,
    steps,
    fieldKeys: Array.from(fieldKeys),
  };
}

/**
 * Validate that runtime answers (a POJO) conform to a stored form mapping
 * schema. Returns the list of AJV error objects — the admin UI does not
 * call this directly in Phase 1a, but Phase 1c client renderer will.
 */
export function validateAnswers(
  schema: FormMappingSchema,
  answers: unknown,
): { valid: boolean; errors: ErrorObject[] } {
  try {
    const validate = ajv.compile(schema as object);
    const ok = validate(answers);
    return { valid: Boolean(ok), errors: validate.errors ?? [] };
  } catch (err) {
    return {
      valid: false,
      errors: [
        {
          instancePath: '',
          schemaPath: '#',
          keyword: 'compile',
          params: {},
          message: err instanceof Error ? err.message : String(err),
        } as ErrorObject,
      ],
    };
  }
}
