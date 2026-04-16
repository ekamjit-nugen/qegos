import type { Model } from 'mongoose';
import type { IRoleDocument, AnomalyResult } from '../types';

// Simplified user interface — the actual model is provided by the consuming app
interface UserLike {
  _id: string;
  roleId: {
    _id: string;
    name: string;
    isActive: boolean;
    permissions: IRoleDocument['permissions'];
  };
  userType: number;
  lastLoginAt?: Date;
  status: boolean;
}

/**
 * Run anomaly detection rules against current role and user state.
 * Results are returned for display/alerting. Rules from PRD Section 2.9.
 */
export async function detectAnomalies(
  RoleModel: Model<IRoleDocument>,
  UserModel: Model<unknown>,
): Promise<AnomalyResult[]> {
  const results: AnomalyResult[] = [];

  const roles = await RoleModel.find({}).lean<IRoleDocument[]>();
  const users = await (UserModel as unknown as Model<UserLike>)
    .find({ isDeleted: { $ne: true } })
    .populate('roleId')
    .lean<UserLike[]>();

  // Rule 1: Staff with admin-level access
  const adminResources = ['payments', 'system_config', 'audit_logs'];
  const staffUsers = users.filter((u) => u.userType >= 3 && u.userType <= 6);
  const overprivileged = staffUsers.filter((u) => {
    if (!u.roleId?.permissions) {
      return false;
    }
    return u.roleId.permissions.some(
      (p) =>
        adminResources.includes(p.resource) &&
        p.actions.includes('create') &&
        p.actions.includes('delete') &&
        p.scope === 'all',
    );
  });
  if (overprivileged.length > 0) {
    results.push({
      rule: 'Staff with admin-level access',
      severity: 'critical',
      description: 'Non-admin user has CRUD/all on sensitive resources',
      affectedUsers: overprivileged.map((u) => ({
        userId: u._id.toString(),
        roleName: u.roleId?.name || 'unknown',
        detail: 'Has CRUD/all on payments, system_config, or audit_logs',
      })),
    });
  }

  // Rule 2: Orphaned users — active user with disabled role
  const orphaned = users.filter((u) => u.status && u.roleId && !u.roleId.isActive);
  if (orphaned.length > 0) {
    results.push({
      rule: 'Orphaned users',
      severity: 'high',
      description: 'Active user with disabled role',
      affectedUsers: orphaned.map((u) => ({
        userId: u._id.toString(),
        roleName: u.roleId?.name || 'unknown',
        detail: 'Role is disabled (isActive=false)',
      })),
    });
  }

  // Rule 3: Over-privileged scope — staff with "all" where "assigned" is standard
  const staffRoles = ['staff', 'senior_staff'];
  const scopeIssues = staffUsers.filter((u) => {
    if (!u.roleId?.permissions || !staffRoles.includes(u.roleId.name)) {
      return false;
    }
    return u.roleId.permissions.some(
      (p) => ['orders', 'vault_documents', 'payments'].includes(p.resource) && p.scope === 'all',
    );
  });
  if (scopeIssues.length > 0) {
    results.push({
      rule: 'Over-privileged scope',
      severity: 'warning',
      description: 'Staff with "all" scope where "assigned" is standard',
      affectedUsers: scopeIssues.map((u) => ({
        userId: u._id.toString(),
        roleName: u.roleId?.name || 'unknown',
        detail: 'Has "all" scope on resources where "assigned" is baseline',
      })),
    });
  }

  // Rule 4: No reviewer available
  const reviewRoles = roles.filter(
    (r) =>
      r.isActive &&
      r.permissions.some(
        (p) => p.resource === 'reviews' && p.actions.includes('update') && p.scope === 'all',
      ),
  );
  if (reviewRoles.length === 0) {
    results.push({
      rule: 'No reviewer available',
      severity: 'critical',
      description: 'Zero active roles with review management permissions',
      affectedUsers: [],
    });
  }

  // Rule 5: Unused admin accounts — admin with no login in 90+ days
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const staleAdmins = users.filter(
    (u) => u.userType <= 1 && u.status && (!u.lastLoginAt || u.lastLoginAt < ninetyDaysAgo),
  );
  if (staleAdmins.length > 0) {
    results.push({
      rule: 'Unused admin accounts',
      severity: 'warning',
      description: 'Admin users with no login in 90+ days',
      affectedUsers: staleAdmins.map((u) => ({
        userId: u._id.toString(),
        roleName: u.roleId?.name || 'unknown',
        detail: `Last login: ${u.lastLoginAt?.toISOString() || 'never'}`,
      })),
    });
  }

  return results;
}
