import type { IPermission } from '../types';

interface RoleSeed {
  name: string;
  displayName: string;
  permissions: IPermission[];
  isSystem: boolean;
}

// Full permission matrix from PRD Section 2.3

function perm(resource: string, actions: string[], scope: string): IPermission {
  return {
    resource,
    actions: actions as IPermission['actions'],
    scope: scope as IPermission['scope'],
  };
}

export const defaultRoles: RoleSeed[] = [
  {
    name: 'super_admin',
    displayName: 'Super Admin',
    isSystem: true,
    permissions: [
      perm('users', ['create', 'read', 'update', 'delete'], 'all'),
      perm('orders', ['create', 'read', 'update', 'delete'], 'all'),
      perm('payments', ['create', 'read', 'update', 'delete'], 'all'),
      perm('leads', ['create', 'read', 'update', 'delete'], 'all'),
      perm('lead_activities', ['create', 'read', 'update', 'delete'], 'all'),
      perm('broadcasts', ['create', 'read', 'update', 'delete'], 'all'),
      perm('vault_documents', ['create', 'read', 'update', 'delete'], 'all'),
      perm('xero_config', ['create', 'read', 'update', 'delete'], 'all'),
      perm('payment_config', ['create', 'read', 'update', 'delete'], 'all'),
      perm('analytics', ['read', 'export'], 'all'),
      perm('reviews', ['create', 'read', 'update', 'delete'], 'all'),
      perm('chat', ['create', 'read', 'update', 'delete'], 'all'),
      perm('referrals', ['create', 'read', 'update', 'delete'], 'all'),
      perm('staff_mgmt', ['create', 'read', 'update', 'delete'], 'all'),
      perm('system_config', ['create', 'read', 'update', 'delete'], 'all'),
      perm('audit_logs', ['read'], 'all'),
      perm('calendar', ['create', 'read', 'update', 'delete'], 'all'),
      perm('whatsapp_config', ['create', 'read', 'update', 'delete'], 'all'),
      perm('form_mappings', ['create', 'read', 'update', 'delete'], 'all'),
      perm('consent_forms', ['read'], 'all'),
    ],
  },
  {
    name: 'admin',
    displayName: 'Admin',
    isSystem: true,
    permissions: [
      perm('users', ['create', 'read', 'update', 'delete'], 'all'),
      perm('orders', ['create', 'read', 'update', 'delete'], 'all'),
      perm('payments', ['create', 'read', 'update', 'delete'], 'all'),
      perm('leads', ['create', 'read', 'update', 'delete'], 'all'),
      perm('lead_activities', ['create', 'read', 'update', 'delete'], 'all'),
      perm('broadcasts', ['create', 'read', 'update', 'delete'], 'all'),
      perm('vault_documents', ['create', 'read', 'update', 'delete'], 'all'),
      perm('xero_config', ['create', 'read', 'update', 'delete'], 'all'),
      perm('payment_config', ['create', 'read', 'update', 'delete'], 'all'),
      perm('analytics', ['read', 'export'], 'all'),
      perm('reviews', ['create', 'read', 'update', 'delete'], 'all'),
      perm('chat', ['create', 'read', 'update', 'delete'], 'all'),
      perm('referrals', ['create', 'read', 'update', 'delete'], 'all'),
      perm('staff_mgmt', ['create', 'read', 'update', 'delete'], 'all'),
      perm('system_config', ['create', 'read', 'update'], 'all'),
      perm('audit_logs', ['read'], 'all'),
      perm('calendar', ['create', 'read', 'update', 'delete'], 'all'),
      perm('whatsapp_config', ['create', 'read', 'update', 'delete'], 'all'),
      perm('form_mappings', ['create', 'read', 'update', 'delete'], 'all'),
      perm('consent_forms', ['read'], 'all'),
    ],
  },
  {
    name: 'office_manager',
    displayName: 'Office Manager',
    isSystem: true,
    permissions: [
      perm('users', ['read'], 'all'),
      perm('orders', ['create', 'read', 'update', 'delete'], 'all'),
      perm('payments', ['read'], 'all'),
      perm('leads', ['create', 'read', 'update', 'delete'], 'all'),
      perm('lead_activities', ['create', 'read', 'update', 'delete'], 'all'),
      perm('broadcasts', ['create', 'read', 'update'], 'all'),
      perm('vault_documents', ['read', 'update'], 'all'),
      perm('xero_config', ['read'], 'all'),
      perm('payment_config', ['read'], 'all'),
      perm('analytics', ['read', 'export'], 'all'),
      perm('reviews', ['read', 'update'], 'all'),
      perm('chat', ['read'], 'all'),
      perm('referrals', ['read'], 'all'),
      perm('staff_mgmt', ['read', 'update'], 'all'),
      perm('system_config', ['read'], 'all'),
      perm('calendar', ['create', 'read', 'update', 'delete'], 'all'),
      perm('whatsapp_config', ['read'], 'all'),
      perm('form_mappings', ['read'], 'all'),
      perm('consent_forms', ['read'], 'all'),
    ],
  },
  {
    name: 'senior_staff',
    displayName: 'Senior Staff',
    isSystem: true,
    permissions: [
      perm('users', ['read'], 'assigned'),
      perm('orders', ['create', 'read', 'update', 'delete'], 'assigned'),
      perm('payments', ['read'], 'assigned'),
      perm('leads', ['create', 'read', 'update', 'delete'], 'all'),
      perm('lead_activities', ['create', 'read', 'update', 'delete'], 'all'),
      perm('broadcasts', ['read'], 'all'),
      perm('vault_documents', ['read', 'update'], 'assigned'),
      perm('analytics', ['read'], 'own'),
      perm('reviews', ['read'], 'own'),
      perm('chat', ['read', 'update'], 'assigned'),
      perm('referrals', ['read'], 'all'),
      perm('calendar', ['read'], 'all'),
      perm('form_mappings', ['read'], 'all'),
    ],
  },
  {
    name: 'staff',
    displayName: 'Staff',
    isSystem: true,
    permissions: [
      perm('users', ['read'], 'assigned'),
      perm('orders', ['read', 'update'], 'assigned'),
      perm('payments', ['read'], 'assigned'),
      perm('leads', ['create', 'read', 'update', 'delete'], 'assigned'),
      perm('lead_activities', ['create', 'read', 'update', 'delete'], 'assigned'),
      perm('vault_documents', ['read'], 'assigned'),
      perm('analytics', ['read'], 'own'),
      perm('reviews', ['read'], 'own'),
      perm('chat', ['read', 'update'], 'assigned'),
      perm('calendar', ['read'], 'all'),
      perm('form_mappings', ['read'], 'all'),
    ],
  },
  {
    name: 'client',
    displayName: 'Client',
    isSystem: true,
    permissions: [
      perm('users', ['read', 'update'], 'own'),
      perm('orders', ['create', 'read'], 'own'),
      perm('payments', ['read'], 'own'),
      perm('vault_documents', ['create', 'read', 'update', 'delete'], 'own'),
      perm('reviews', ['create', 'read', 'update'], 'own'),
      perm('chat', ['read', 'update'], 'own'),
      perm('referrals', ['read'], 'own'),
      perm('calendar', ['read'], 'own'),
      perm('consent_forms', ['create', 'read'], 'own'),
    ],
  },
  {
    name: 'student',
    displayName: 'Student',
    isSystem: true,
    permissions: [
      perm('users', ['read', 'update'], 'own'),
      perm('orders', ['create', 'read'], 'own'),
      perm('payments', ['read'], 'own'),
      perm('vault_documents', ['create', 'read', 'update', 'delete'], 'own'),
      perm('reviews', ['create', 'read', 'update'], 'own'),
      perm('chat', ['read', 'update'], 'own'),
      perm('referrals', ['read'], 'own'),
      perm('calendar', ['read'], 'own'),
      perm('consent_forms', ['create', 'read'], 'own'),
    ],
  },
];

/**
 * Get baseline permissions for a system role by name.
 * Used for RBAC-INV-05 validation: system roles cannot be reduced below baseline.
 * FIX for Vegeta B-13: Actual implementation of baseline comparison.
 */
export function getBaselinePermissions(roleName: string): IPermission[] | null {
  const role = defaultRoles.find((r) => r.name === roleName);
  return role ? role.permissions : null;
}
