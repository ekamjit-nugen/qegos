import type { Connection, Model } from 'mongoose';
import type Redis from 'ioredis';
import { createRoleModel } from './models/roleModel';
import { createPermissionSnapshotModel } from './models/permissionSnapshotModel';
import { initCheckPermission } from './middleware/checkPermission';
import { defaultRoles } from './seed/defaultRoles';
import type { IRoleDocument, IPermissionSnapshotDocument, RbacConfig } from './types';

export interface RbacInitResult {
  RoleModel: Model<IRoleDocument>;
  PermissionSnapshotModel: Model<IPermissionSnapshotDocument>;
}

/**
 * Initialize the RBAC package.
 */
export function init(
  connection: Connection,
  redisClient?: Redis,
  config?: RbacConfig,
): RbacInitResult {
  const RoleModel = createRoleModel(connection);
  const PermissionSnapshotModel = createPermissionSnapshotModel(connection);
  initCheckPermission(RoleModel, redisClient, config);
  return { RoleModel, PermissionSnapshotModel };
}

/**
 * Seed default roles. Uses $setOnInsert to not overwrite existing roles.
 * For permission updates on existing deployments, use a migration script.
 */
export async function seedRoles(RoleModel: Model<IRoleDocument>): Promise<void> {
  for (const role of defaultRoles) {
    await RoleModel.updateOne(
      { name: role.name },
      { $setOnInsert: role },
      { upsert: true },
    );
  }
}

// Re-export everything
export * from './types';
export { createRoleModel } from './models/roleModel';
export { createPermissionSnapshotModel, computeDiff } from './models/permissionSnapshotModel';
export { rbacPlugin } from './models/rbacPlugin';
export {
  check,
  initCheckPermission,
  invalidateRoleCache,
  invalidateAllRoleCaches,
} from './middleware/checkPermission';
export { defaultRoles, getBaselinePermissions } from './seed/defaultRoles';
export { detectAnomalies } from './services/anomalyDetector';
export { createRbacRoutes, type RbacRouteDeps } from './routes/rbacRoutes';
