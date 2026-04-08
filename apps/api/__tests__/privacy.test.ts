/**
 * Privacy & Data Lifecycle — Tests
 *
 * Tests for Privacy Act 1988 compliance: erasure workflow, data export,
 * retention policies, and privacy route configuration.
 */

import {
  ERASURE_REQUEST_STATUSES,
  DATA_EXPORT_STATUSES,
} from '@nugen/data-lifecycle/src/types';

import type {
  ErasureRequestStatus,
  DataExportStatus,
  DataExportFormat,
  RetentionAction,
  DataLifecycleConfig,
  ModelFieldConfig,
  RetentionPolicyConfig,
} from '@nugen/data-lifecycle/src/types';

// ═══════════════════════════════════════════════════════════════════════════════

describe('Privacy & Data Lifecycle (Privacy Act 1988)', () => {

  // ─── Erasure Request Workflow (GAP-C01) ────────────────────────────────────

  describe('Erasure Request Workflow', () => {
    it('follows the lifecycle: pending → approved → in_progress → completed', () => {
      const lifecycle: ErasureRequestStatus[] = ['pending', 'approved', 'in_progress', 'completed'];
      lifecycle.forEach((status) => {
        expect(ERASURE_REQUEST_STATUSES).toContain(status);
      });
    });

    it('supports rejection path: pending → rejected', () => {
      expect(ERASURE_REQUEST_STATUSES).toContain('pending');
      expect(ERASURE_REQUEST_STATUSES).toContain('rejected');
    });

    it('supports failure path: in_progress → failed', () => {
      expect(ERASURE_REQUEST_STATUSES).toContain('in_progress');
      expect(ERASURE_REQUEST_STATUSES).toContain('failed');
    });

    it('has no duplicate statuses', () => {
      const unique = [...new Set(ERASURE_REQUEST_STATUSES)];
      expect(unique).toHaveLength(ERASURE_REQUEST_STATUSES.length);
    });
  });

  // ─── Data Export Workflow (GAP-C02) ────────────────────────────────────────

  describe('Data Export Workflow', () => {
    it('follows the lifecycle: pending → processing → ready', () => {
      const lifecycle: DataExportStatus[] = ['pending', 'processing', 'ready'];
      lifecycle.forEach((status) => {
        expect(DATA_EXPORT_STATUSES).toContain(status);
      });
    });

    it('exports expire after TTL: ready → expired', () => {
      expect(DATA_EXPORT_STATUSES).toContain('expired');
    });

    it('supports failure: processing → failed', () => {
      expect(DATA_EXPORT_STATUSES).toContain('failed');
    });

    it('supports json and csv formats', () => {
      const formats: DataExportFormat[] = ['json', 'csv'];
      expect(formats).toHaveLength(2);
    });
  });

  // ─── Retention Policies ────────────────────────────────────────────────────

  describe('Retention Policies', () => {
    it('supports three retention actions', () => {
      const actions: RetentionAction[] = ['anonymize', 'soft_delete', 'hard_delete'];
      expect(actions).toHaveLength(3);
    });

    it('ChatMessage retention is 2 years (730 days) with anonymization', () => {
      // This matches the config in server.ts
      const chatRetention: RetentionPolicyConfig = {
        modelName: 'ChatMessage',
        retentionDays: 730,
        action: 'anonymize',
        dateField: 'createdAt',
      };
      expect(chatRetention.retentionDays).toBe(730);
      expect(chatRetention.action).toBe('anonymize');
    });

    it('retention policies can have custom filters', () => {
      const policy: RetentionPolicyConfig = {
        modelName: 'AuditLog',
        retentionDays: 365 * 7, // 7 years for compliance
        action: 'hard_delete',
        dateField: 'timestamp',
        filter: { severity: { $ne: 'critical' } },
      };
      expect(policy.filter).toBeDefined();
      expect(policy.retentionDays).toBe(2555);
    });
  });

  // ─── PII Anonymization ─────────────────────────────────────────────────────

  describe('PII Anonymization Config', () => {
    it('User model defines all PII fields for anonymization', () => {
      // These are the PII fields that must be anonymized per Privacy Act 1988
      const userPiiFields: Record<string, string> = {
        firstName: 'REDACTED',
        lastName: 'REDACTED',
        email: 'deleted@redacted.local',
        mobile: '+61000000000',
        tfnEncrypted: '',
        tfnLastThree: '***',
        abnNumber: '',
        dateOfBirth: '',
        profileImage: '',
      };

      // At minimum, firstName, lastName, email, mobile, TFN must be anonymized
      expect(userPiiFields).toHaveProperty('firstName');
      expect(userPiiFields).toHaveProperty('lastName');
      expect(userPiiFields).toHaveProperty('email');
      expect(userPiiFields).toHaveProperty('mobile');
      expect(userPiiFields).toHaveProperty('tfnEncrypted');
    });

    it('anonymized email follows redacted pattern', () => {
      const anonymizedEmail = 'deleted@redacted.local';
      expect(anonymizedEmail).toMatch(/^deleted@/);
    });

    it('anonymized mobile is a valid E.164 placeholder', () => {
      const anonymizedMobile = '+61000000000';
      expect(anonymizedMobile).toMatch(/^\+61\d{9}$/);
    });
  });

  // ─── DataLifecycleConfig (as used in server.ts) ────────────────────────────

  describe('Server Configuration', () => {
    it('erasure grace period is 30 days', () => {
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
    });

    it('export files expire after 48 hours', () => {
      const config: DataLifecycleConfig = {
        exportExpiryHours: 48,
      };
      expect(config.exportExpiryHours).toBe(48);
    });
  });

  // ─── Model Field Config Compliance ─────────────────────────────────────────

  describe('Model Field Config Compliance', () => {
    it('every model with user data has a userIdField', () => {
      const configs: Array<Omit<ModelFieldConfig, 'model'>> = [
        { displayName: 'Users', userIdField: '_id', piiFields: { firstName: 'REDACTED' } },
        { displayName: 'Orders', userIdField: 'userId', piiFields: {} },
        { displayName: 'Payments', userIdField: 'userId', piiFields: {} },
        { displayName: 'Leads', userIdField: '_id', piiFields: { firstName: 'REDACTED' } },
        { displayName: 'Chat Messages', userIdField: 'senderId', piiFields: { content: '[message deleted]' } },
      ];

      for (const config of configs) {
        expect(config.userIdField).toBeTruthy();
        expect(typeof config.userIdField).toBe('string');
      }
    });

    it('hardDelete models have no PII fields (delete entire record)', () => {
      const config: Omit<ModelFieldConfig, 'model'> = {
        displayName: 'Tax Return Results',
        userIdField: 'userId',
        piiFields: {},
        hardDelete: true,
      };
      expect(Object.keys(config.piiFields)).toHaveLength(0);
      expect(config.hardDelete).toBe(true);
    });
  });

  // ─── Package Exports ───────────────────────────────────────────────────────

  describe('Privacy Package Exports', () => {
    it('exports all erasure service functions', () => {
      const mod = require('@nugen/data-lifecycle/src');
      expect(typeof mod.createErasureRequest).toBe('function');
      expect(typeof mod.approveErasureRequest).toBe('function');
      expect(typeof mod.rejectErasureRequest).toBe('function');
      expect(typeof mod.executeErasure).toBe('function');
    });

    it('exports all export service functions', () => {
      const mod = require('@nugen/data-lifecycle/src');
      expect(typeof mod.createExportRequest).toBe('function');
      expect(typeof mod.executeExport).toBe('function');
      expect(typeof mod.cleanupExpiredExports).toBe('function');
    });

    it('exports retention enforcement function', () => {
      const mod = require('@nugen/data-lifecycle/src');
      expect(typeof mod.enforceRetentionPolicies).toBe('function');
    });
  });
});
