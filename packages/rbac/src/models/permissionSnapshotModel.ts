import crypto from 'crypto';
import { Schema, type Model, type Connection } from 'mongoose';
import type { IPermissionSnapshotDocument, IPermission, PermissionDiff } from '../types';

const permissionSnapshotSchema = new Schema<IPermissionSnapshotDocument>(
  {
    snapshotId: { type: String, default: () => crypto.randomUUID(), unique: true },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
    roleName: { type: String, required: true },
    permissionsBefore: { type: Schema.Types.Mixed, required: true },
    permissionsAfter: { type: Schema.Types.Mixed, required: true },
    diff: { type: Schema.Types.Mixed, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },
  },
  { timestamps: true },
);

permissionSnapshotSchema.index({ roleId: 1, createdAt: -1 });
permissionSnapshotSchema.index({ changedBy: 1, createdAt: -1 });

/**
 * Compute diff between two permission arrays (PRM-INV-01).
 * Standalone function — not a model static, to avoid Vegeta B-15 issue.
 */
export function computeDiff(
  before: IPermission[],
  after: IPermission[],
): PermissionDiff[] {
  const diffs: PermissionDiff[] = [];

  const beforeMap = new Map<string, IPermission>();
  for (const p of before) {
    beforeMap.set(p.resource, p);
  }

  const afterMap = new Map<string, IPermission>();
  for (const p of after) {
    afterMap.set(p.resource, p);
  }

  // Check for removed and changed resources
  for (const [resource, beforePerm] of beforeMap) {
    const afterPerm = afterMap.get(resource);
    if (!afterPerm) {
      diffs.push({
        resource,
        changeType: 'removed',
        before: `${beforePerm.actions.join(',')}/${beforePerm.scope}`,
      });
      continue;
    }

    // Check scope changes
    if (beforePerm.scope !== afterPerm.scope) {
      diffs.push({
        resource,
        scope: afterPerm.scope,
        changeType: 'scope_changed',
        before: beforePerm.scope,
        after: afterPerm.scope,
      });
    }

    // Check for removed actions
    for (const action of beforePerm.actions) {
      if (!afterPerm.actions.includes(action)) {
        diffs.push({
          resource,
          action,
          changeType: 'removed',
          before: action,
        });
      }
    }

    // Check for added actions
    for (const action of afterPerm.actions) {
      if (!beforePerm.actions.includes(action)) {
        diffs.push({
          resource,
          action,
          changeType: 'added',
          after: action,
        });
      }
    }
  }

  // Check for newly added resources
  for (const [resource, afterPerm] of afterMap) {
    if (!beforeMap.has(resource)) {
      diffs.push({
        resource,
        changeType: 'added',
        after: `${afterPerm.actions.join(',')}/${afterPerm.scope}`,
      });
    }
  }

  return diffs;
}

/**
 * Factory function to create the PermissionSnapshot model.
 */
export function createPermissionSnapshotModel(
  connection: Connection,
): Model<IPermissionSnapshotDocument> {
  return connection.model<IPermissionSnapshotDocument>(
    'PermissionSnapshot',
    permissionSnapshotSchema,
  );
}
