import type { Schema, Document } from 'mongoose';
import { log } from '../services/auditService';
import type { AuditMiddlewareOptions, AuditSeverity, AuditAction } from '../types';

/**
 * Mongoose plugin that auto-logs create/update/delete operations to audit log.
 * Attaches to post-save and post-remove hooks.
 *
 * FIX for Vegeta B-16: Only uses wasNew flag (set in pre-save), not $isNew.
 * FIX for Vegeta B-17: Guards $locals access in pre-save hook.
 */
export function auditMiddleware(schema: Schema, options: AuditMiddlewareOptions): void {
  const { resource, getSeverity } = options;

  const defaultSeverity = (action: string): AuditSeverity => {
    if (['delete', 'config_change', 'payment_capture', 'refund'].includes(action)) {
      return 'critical';
    }
    if (['update', 'status_change', 'assign'].includes(action)) {
      return 'warning';
    }
    return 'info';
  };

  const severityFn = getSeverity ?? defaultSeverity;

  // Pre-save: capture state for change tracking
  schema.pre('save', function (next) {
    // FIX B-17: Guard $locals access
    if (!this.$locals) {
      this.$locals = {};
    }
    (this.$locals as Record<string, unknown>)._wasNew = this.isNew;
    if (!this.isNew) {
      (this.$locals as Record<string, unknown>)._modifiedPaths = this.modifiedPaths();
    }
    next();
  });

  // Post-save: log the event
  schema.post('save', async function (doc: Document) {
    try {
      // FIX B-16: Only use wasNew flag, not $isNew
      const wasNew = (doc.$locals as Record<string, unknown>)?._wasNew as boolean;
      const action: AuditAction = wasNew ? 'create' : 'update';

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (!wasNew) {
        const modifiedPaths = (doc.$locals as Record<string, unknown>)?._modifiedPaths as
          | string[]
          | undefined;
        if (modifiedPaths) {
          for (const path of modifiedPaths) {
            changes[path] = { from: undefined, to: doc.get(path) };
          }
        }
      }

      await log({
        actor: 'system', // Will be overridden by request-level logging if available
        actorType: 'system',
        action,
        resource,
        resourceId: doc._id.toString(),
        changes: Object.keys(changes).length > 0 ? changes : undefined,
        severity: severityFn(action),
      });
    } catch {
      // Audit logging failure should not break the operation
    }
  });

  // Post-remove: log deletion
  schema.post('findOneAndDelete', async function (doc: Document | null) {
    if (!doc) {
      return;
    }
    try {
      await log({
        actor: 'system',
        actorType: 'system',
        action: 'delete',
        resource,
        resourceId: doc._id.toString(),
        severity: severityFn('delete'),
      });
    } catch {
      // Non-fatal
    }
  });
}
