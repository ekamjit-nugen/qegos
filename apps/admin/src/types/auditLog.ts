export type AuditSeverity = 'info' | 'warning' | 'critical';

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'user.login': 'User Login',
  'user.logout': 'User Logout',
  'user.create': 'User Created',
  'user.update': 'User Updated',
  'user.delete': 'User Deleted',
  'order.create': 'Order Created',
  'order.update': 'Order Updated',
  'order.status_change': 'Order Status Changed',
  'order.delete': 'Order Deleted',
  'lead.create': 'Lead Created',
  'lead.update': 'Lead Updated',
  'lead.status_change': 'Lead Status Changed',
  'payment.create': 'Payment Created',
  'payment.refund': 'Payment Refunded',
  'document.upload': 'Document Uploaded',
  'document.delete': 'Document Deleted',
  'settings.update': 'Settings Updated',
  'role.update': 'Role Updated',
};

export const AUDIT_SEVERITY_COLORS: Record<AuditSeverity, string> = {
  info: 'blue',
  warning: 'orange',
  critical: 'red',
};

export interface AuditLog {
  _id: string;
  actor: string;
  actorType: string;
  action: string;
  resource: string;
  resourceId: string;
  description: string;
  severity: AuditSeverity;
  timestamp: string;
}

export interface AuditLogQuery {
  page?: number;
  limit?: number;
  action?: string;
  resource?: string;
  severity?: AuditSeverity;
  dateFrom?: string;
  dateTo?: string;
}
