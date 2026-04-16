/**
 * Data Lifecycle — Tests (Privacy Act 1988 compliance)
 *
 * Tests for @nugen/data-lifecycle: erasure requests, data exports, retention policies.
 * Unit/structural tests — no database required.
 */

import { ERASURE_REQUEST_STATUSES, DATA_EXPORT_STATUSES } from '../src/types';

import type {
  ErasureRequestStatus,
  DataExportStatus,
  DataExportFormat,
  RetentionAction,
  RetentionPolicyConfig,
  ModelFieldConfig,
  DataLifecycleConfig,
  IErasureRequest,
  IDataExport,
} from '../src/types';

// ═══════════════════════════════════════════════════════════════════════════════

describe('@nugen/data-lifecycle', () => {
  // ─── Erasure Request Statuses ──────────────────────────────────────────────

  describe('Erasure Request Statuses', () => {
    it('defines exactly 6 statuses', () => {
      expect(ERASURE_REQUEST_STATUSES).toHaveLength(6);
    });

    it('includes all required statuses', () => {
      expect(ERASURE_REQUEST_STATUSES).toEqual([
        'pending',
        'approved',
        'in_progress',
        'completed',
        'failed',
        'rejected',
      ]);
    });

    it('starts with pending (default)', () => {
      expect(ERASURE_REQUEST_STATUSES[0]).toBe('pending');
    });

    it('includes terminal states: completed, failed, rejected', () => {
      expect(ERASURE_REQUEST_STATUSES).toContain('completed');
      expect(ERASURE_REQUEST_STATUSES).toContain('failed');
      expect(ERASURE_REQUEST_STATUSES).toContain('rejected');
    });
  });

  // ─── Data Export Statuses ──────────────────────────────────────────────────

  describe('Data Export Statuses', () => {
    it('defines exactly 5 statuses', () => {
      expect(DATA_EXPORT_STATUSES).toHaveLength(5);
    });

    it('includes all required statuses', () => {
      expect(DATA_EXPORT_STATUSES).toEqual(['pending', 'processing', 'ready', 'expired', 'failed']);
    });

    it('starts with pending (default)', () => {
      expect(DATA_EXPORT_STATUSES[0]).toBe('pending');
    });
  });

  // ─── Type Shape Validation ─────────────────────────────────────────────────

  describe('Type Shapes', () => {
    it('IErasureRequest has required fields', () => {
      const request: Partial<IErasureRequest> = {
        status: 'pending',
        modelsProcessed: [],
        recordsAnonymized: 0,
        recordsDeleted: 0,
      };
      expect(request.status).toBe('pending');
      expect(request.modelsProcessed).toEqual([]);
      expect(request.recordsAnonymized).toBe(0);
      expect(request.recordsDeleted).toBe(0);
    });

    it('IDataExport has required fields', () => {
      const exp: Partial<IDataExport> = {
        status: 'pending',
        format: 'json',
        modelsIncluded: [],
        recordCount: 0,
      };
      expect(exp.status).toBe('pending');
      expect(exp.format).toBe('json');
    });

    it('DataExportFormat is json or csv', () => {
      const json: DataExportFormat = 'json';
      const csv: DataExportFormat = 'csv';
      expect(json).toBe('json');
      expect(csv).toBe('csv');
    });

    it('RetentionAction is anonymize, soft_delete, or hard_delete', () => {
      const actions: RetentionAction[] = ['anonymize', 'soft_delete', 'hard_delete'];
      expect(actions).toHaveLength(3);
    });
  });

  // ─── Retention Policy Config ───────────────────────────────────────────────

  describe('Retention Policy Config', () => {
    it('accepts valid retention policy shape', () => {
      const policy: RetentionPolicyConfig = {
        modelName: 'ChatMessage',
        retentionDays: 730,
        action: 'anonymize',
        dateField: 'createdAt',
      };
      expect(policy.retentionDays).toBe(730);
      expect(policy.action).toBe('anonymize');
    });

    it('accepts optional filter field', () => {
      const policy: RetentionPolicyConfig = {
        modelName: 'AuditLog',
        retentionDays: 365 * 7,
        action: 'hard_delete',
        dateField: 'timestamp',
        filter: { severity: 'info' },
      };
      expect(policy.filter).toEqual({ severity: 'info' });
    });
  });

  // ─── Model Field Config ────────────────────────────────────────────────────

  describe('Model Field Config', () => {
    it('defines PII fields for anonymization', () => {
      const config: Omit<ModelFieldConfig, 'model'> = {
        displayName: 'Users',
        userIdField: '_id',
        piiFields: {
          firstName: 'REDACTED',
          lastName: 'REDACTED',
          email: 'deleted@example.com',
          mobile: '+61000000000',
          tfnEncrypted: '',
        },
      };
      expect(Object.keys(config.piiFields)).toHaveLength(5);
      expect(config.piiFields.firstName).toBe('REDACTED');
    });

    it('supports hardDelete flag', () => {
      const config: Omit<ModelFieldConfig, 'model'> = {
        displayName: 'Tax Return Results',
        userIdField: 'userId',
        piiFields: {},
        hardDelete: true,
      };
      expect(config.hardDelete).toBe(true);
    });

    it('supports exportExclude for sensitive fields', () => {
      const config: Omit<ModelFieldConfig, 'model'> = {
        displayName: 'Users',
        userIdField: '_id',
        piiFields: {},
        exportExclude: ['password', 'tfnEncrypted', 'mfaSecret', 'mfaBackupCodes'],
      };
      expect(config.exportExclude).toContain('password');
      expect(config.exportExclude).toContain('tfnEncrypted');
    });
  });

  // ─── Package Config Defaults ───────────────────────────────────────────────

  describe('DataLifecycleConfig', () => {
    it('all fields are optional with sensible defaults implied', () => {
      const config: DataLifecycleConfig = {};
      expect(config.erasureGracePeriodDays).toBeUndefined();
      expect(config.exportExpiryHours).toBeUndefined();
      expect(config.retentionPolicies).toBeUndefined();
    });

    it('accepts full config', () => {
      const config: DataLifecycleConfig = {
        erasureGracePeriodDays: 30,
        exportExpiryHours: 48,
        retentionPolicies: [
          {
            modelName: 'ChatMessage',
            retentionDays: 730,
            action: 'anonymize',
            dateField: 'createdAt',
          },
        ],
      };
      expect(config.erasureGracePeriodDays).toBe(30);
      expect(config.retentionPolicies).toHaveLength(1);
    });
  });

  // ─── Module Exports ────────────────────────────────────────────────────────

  describe('Package Exports', () => {
    it('exports init function', () => {
      const mod = require('../src');
      expect(typeof mod.init).toBe('function');
    });

    it('exports erasure service functions', () => {
      const mod = require('../src');
      expect(typeof mod.createErasureRequest).toBe('function');
      expect(typeof mod.listErasureRequests).toBe('function');
      expect(typeof mod.approveErasureRequest).toBe('function');
      expect(typeof mod.rejectErasureRequest).toBe('function');
      expect(typeof mod.executeErasure).toBe('function');
      expect(typeof mod.getErasureRequest).toBe('function');
    });

    it('exports export service functions', () => {
      const mod = require('../src');
      expect(typeof mod.createExportRequest).toBe('function');
      expect(typeof mod.executeExport).toBe('function');
      expect(typeof mod.listExports).toBe('function');
      expect(typeof mod.getExport).toBe('function');
      expect(typeof mod.cleanupExpiredExports).toBe('function');
    });

    it('exports retention service function', () => {
      const mod = require('../src');
      expect(typeof mod.enforceRetentionPolicies).toBe('function');
    });

    it('exports model factory functions', () => {
      const mod = require('../src');
      expect(typeof mod.createErasureRequestModel).toBe('function');
      expect(typeof mod.createDataExportModel).toBe('function');
    });
  });
});
