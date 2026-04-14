export type AuditSeverity = 'info' | 'warning' | 'critical';

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  read: 'Viewed',
  update: 'Updated',
  delete: 'Deleted',
  status_change: 'Status Changed',
  assign: 'Assigned',
  reassign: 'Reassigned',
  login: 'Login',
  login_failed: 'Login Failed',
  logout: 'Logout',
  export: 'Exported',
  bulk_action: 'Bulk Action',
  convert: 'Converted',
  merge: 'Merged',
  refund: 'Refunded',
  void: 'Voided',
  payment_capture: 'Payment Captured',
  config_change: 'Config Changed',
  approve: 'Approved',
  reject: 'Rejected',
  execute: 'Executed',
};

export const AUDIT_SEVERITY_COLORS: Record<AuditSeverity, string> = {
  info: 'blue',
  warning: 'orange',
  critical: 'red',
};

export const AUDIT_ACTOR_TYPE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  office_manager: 'Office Manager',
  senior_staff: 'Senior Staff',
  staff: 'Staff',
  client: 'Client',
  student: 'Student',
  system: 'System',
  cron: 'Cron Job',
};

export const AUDIT_ACTOR_TYPE_COLORS: Record<string, string> = {
  super_admin: 'red',
  admin: 'purple',
  office_manager: 'magenta',
  senior_staff: 'geekblue',
  staff: 'cyan',
  client: 'blue',
  student: 'green',
  system: 'default',
  cron: 'default',
};

export const AUDIT_RESOURCE_OPTIONS = [
  { value: 'user', label: 'User' },
  { value: 'order', label: 'Order' },
  { value: 'lead', label: 'Lead' },
  { value: 'payment', label: 'Payment' },
  { value: 'document', label: 'Document' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'staff_availability', label: 'Staff Availability' },
  { value: 'settings', label: 'Settings' },
  { value: 'promo_code', label: 'Promo Code' },
  { value: 'credit', label: 'Credit' },
  { value: 'referral', label: 'Referral' },
  { value: 'referral_config', label: 'Referral Config' },
  { value: 'referral_share', label: 'Referral Share' },
  { value: 'review_assignment', label: 'Review Assignment' },
  { value: 'consent_form', label: 'Consent Form' },
  { value: 'billing_dispute', label: 'Billing Dispute' },
  { value: 'form_mapping', label: 'Form Mapping' },
  { value: 'broadcast', label: 'Broadcast' },
  { value: 'tax_deadline', label: 'Tax Deadline' },
  { value: 'review', label: 'Review' },
];

export interface AuditLog {
  _id: string;
  actor: string | { _id: string; firstName?: string; lastName?: string; email?: string };
  actorType: string;
  action: string;
  resource: string;
  resourceId: string;
  resourceNumber?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  description: string;
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    requestMethod?: string;
    requestPath?: string;
  };
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
  search?: string;
  actorType?: string;
}
