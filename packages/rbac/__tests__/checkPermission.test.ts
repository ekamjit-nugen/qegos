import { computeDiff } from '../src/models/permissionSnapshotModel';
import { getBaselinePermissions, defaultRoles } from '../src/seed/defaultRoles';
import type { IPermission } from '../src/types';

describe('@nugen/rbac', () => {
  describe('computeDiff (PRM-INV-01)', () => {
    it('should detect added resources', () => {
      const before: IPermission[] = [
        { resource: 'users', actions: ['read'], scope: 'all' },
      ];
      const after: IPermission[] = [
        { resource: 'users', actions: ['read'], scope: 'all' },
        { resource: 'orders', actions: ['create', 'read'], scope: 'own' },
      ];
      const diff = computeDiff(before, after);
      expect(diff).toContainEqual(expect.objectContaining({
        resource: 'orders',
        changeType: 'added',
      }));
    });

    it('should detect removed resources', () => {
      const before: IPermission[] = [
        { resource: 'users', actions: ['read'], scope: 'all' },
        { resource: 'orders', actions: ['read'], scope: 'own' },
      ];
      const after: IPermission[] = [
        { resource: 'users', actions: ['read'], scope: 'all' },
      ];
      const diff = computeDiff(before, after);
      expect(diff).toContainEqual(expect.objectContaining({
        resource: 'orders',
        changeType: 'removed',
      }));
    });

    it('should detect scope changes', () => {
      const before: IPermission[] = [
        { resource: 'orders', actions: ['read'], scope: 'assigned' },
      ];
      const after: IPermission[] = [
        { resource: 'orders', actions: ['read'], scope: 'all' },
      ];
      const diff = computeDiff(before, after);
      expect(diff).toContainEqual(expect.objectContaining({
        resource: 'orders',
        changeType: 'scope_changed',
        before: 'assigned',
        after: 'all',
      }));
    });

    it('should detect added actions', () => {
      const before: IPermission[] = [
        { resource: 'users', actions: ['read'], scope: 'all' },
      ];
      const after: IPermission[] = [
        { resource: 'users', actions: ['read', 'update'], scope: 'all' },
      ];
      const diff = computeDiff(before, after);
      expect(diff).toContainEqual(expect.objectContaining({
        resource: 'users',
        action: 'update',
        changeType: 'added',
      }));
    });

    it('should detect removed actions', () => {
      const before: IPermission[] = [
        { resource: 'users', actions: ['read', 'delete'], scope: 'all' },
      ];
      const after: IPermission[] = [
        { resource: 'users', actions: ['read'], scope: 'all' },
      ];
      const diff = computeDiff(before, after);
      expect(diff).toContainEqual(expect.objectContaining({
        resource: 'users',
        action: 'delete',
        changeType: 'removed',
      }));
    });

    it('should return empty diff when nothing changed', () => {
      const perms: IPermission[] = [
        { resource: 'users', actions: ['read'], scope: 'all' },
      ];
      const diff = computeDiff(perms, perms);
      expect(diff).toHaveLength(0);
    });
  });

  describe('defaultRoles seed data', () => {
    it('should have all 7 system roles', () => {
      expect(defaultRoles).toHaveLength(7);
      const names = defaultRoles.map((r) => r.name);
      expect(names).toContain('super_admin');
      expect(names).toContain('admin');
      expect(names).toContain('office_manager');
      expect(names).toContain('senior_staff');
      expect(names).toContain('staff');
      expect(names).toContain('client');
      expect(names).toContain('student');
    });

    it('should mark all roles as system', () => {
      for (const role of defaultRoles) {
        expect(role.isSystem).toBe(true);
      }
    });

    it('super_admin should have CRUD on all resources', () => {
      const superAdmin = defaultRoles.find((r) => r.name === 'super_admin');
      expect(superAdmin).toBeDefined();
      for (const perm of superAdmin!.permissions) {
        expect(perm.scope).toBe('all');
      }
    });

    it('client should only have own scope', () => {
      const client = defaultRoles.find((r) => r.name === 'client');
      expect(client).toBeDefined();
      for (const perm of client!.permissions) {
        expect(perm.scope).toBe('own');
      }
    });
  });

  describe('getBaselinePermissions (FIX B-13: RBAC-INV-05)', () => {
    it('should return permissions for system roles', () => {
      const baseline = getBaselinePermissions('super_admin');
      expect(baseline).not.toBeNull();
      expect(baseline!.length).toBeGreaterThan(0);
    });

    it('should return null for non-existent roles', () => {
      const baseline = getBaselinePermissions('nonexistent');
      expect(baseline).toBeNull();
    });

    it('baseline should match the seed data exactly', () => {
      const adminSeed = defaultRoles.find((r) => r.name === 'admin');
      const adminBaseline = getBaselinePermissions('admin');
      expect(adminBaseline).toEqual(adminSeed!.permissions);
    });
  });
});
