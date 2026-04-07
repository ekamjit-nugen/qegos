import type { Document, Types } from 'mongoose';
import type { Request } from 'express';

export type PermissionAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'assign'
  | 'export'
  | 'bulk_action';

export type PermissionScope = 'all' | 'assigned' | 'own' | 'none';

export interface IPermission {
  resource: string;
  actions: PermissionAction[];
  scope: PermissionScope;
}

export interface IRole {
  name: string;
  displayName: string;
  permissions: IPermission[];
  isSystem: boolean;
  isActive: boolean;
  createdBy?: Types.ObjectId;
}

export interface IRoleDocument extends IRole, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRbacFields {
  roleId: Types.ObjectId;
  userType: number;
}

export interface ScopeFilter {
  userId?: string;
  assignedTo?: string;
  processingBy?: string;
  [key: string]: unknown;
}

export interface AuthenticatedRbacRequest extends Request {
  user: {
    userId: string;
    userType: number;
    roleId: string;
  };
  scopeFilter?: Record<string, unknown>;
}

export interface IPermissionSnapshot {
  snapshotId: string;
  roleId: Types.ObjectId;
  roleName: string;
  permissionsBefore: IPermission[];
  permissionsAfter: IPermission[];
  diff: PermissionDiff[];
  changedBy: Types.ObjectId;
  reason: string;
}

export interface IPermissionSnapshotDocument extends IPermissionSnapshot, Document {
  _id: Types.ObjectId;
  createdAt: Date;
}

export interface PermissionDiff {
  resource: string;
  action?: string;
  scope?: PermissionScope;
  changeType: 'added' | 'removed' | 'scope_changed';
  before?: string;
  after?: string;
}

export interface RbacConfig {
  cacheTtl?: number; // Redis cache TTL in seconds, default 300 (5 min)
  sensitiveResources?: string[]; // Resources requiring super_admin for escalation
}

export interface AnomalyRule {
  name: string;
  severity: 'critical' | 'high' | 'warning';
  description: string;
}

export interface AnomalyResult {
  rule: string;
  severity: 'critical' | 'high' | 'warning';
  description: string;
  affectedUsers: Array<{ userId: string; roleName: string; detail: string }>;
}
