import type { Document, Types } from 'mongoose';

// ─── Deadline Types ────────────────────────────────────────────────────────

export type DeadlineType =
  | 'individual_filing'
  | 'bas_quarterly'
  | 'bas_monthly'
  | 'payg_instalment'
  | 'super_guarantee'
  | 'fringe_benefits'
  | 'company_return'
  | 'trust_return'
  | 'smsf_return'
  | 'custom';

export const DEADLINE_TYPES: DeadlineType[] = [
  'individual_filing', 'bas_quarterly', 'bas_monthly', 'payg_instalment',
  'super_guarantee', 'fringe_benefits', 'company_return', 'trust_return',
  'smsf_return', 'custom',
];

export type ApplicableTo =
  | 'all_clients'
  | 'individual'
  | 'self_employed'
  | 'business'
  | 'company'
  | 'trust'
  | 'smsf'
  | 'custom_segment';

export const APPLICABLE_TO_VALUES: ApplicableTo[] = [
  'all_clients', 'individual', 'self_employed', 'business',
  'company', 'trust', 'smsf', 'custom_segment',
];

// ─── Reminder Schedule ─────────────────────────────────────────────────────

export type ReminderChannel = 'email' | 'push' | 'sms' | 'sms_push';

export interface ReminderScheduleItem {
  daysBefore: number;
  channel: ReminderChannel;
}

// ─── Tax Deadline Interface ────────────────────────────────────────────────

export interface ITaxDeadline {
  title: string;
  description?: string;
  deadlineDate: Date;
  type: DeadlineType;
  applicableTo: ApplicableTo;
  reminderSchedule: ReminderScheduleItem[];
  financialYear: string;
  isRecurring: boolean;
  isActive: boolean;
  notificationsSent: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITaxDeadlineDocument extends ITaxDeadline, Document {
  _id: Types.ObjectId;
}

// ─── Deadline Reminder (dedup tracking) ────────────────────────────────────

export interface IDeadlineReminder {
  userId: Types.ObjectId;
  deadlineId: Types.ObjectId;
  daysBefore: number;
  channel: ReminderChannel;
  sentAt: Date;
}

export interface IDeadlineReminderDocument extends IDeadlineReminder, Document {
  _id: Types.ObjectId;
}

// ─── Australian Public Holidays ────────────────────────────────────────────

export type AustralianState = 'NSW' | 'VIC' | 'QLD' | 'SA' | 'WA' | 'TAS' | 'NT' | 'ACT';

export const AUSTRALIAN_STATES: AustralianState[] = [
  'NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT',
];

/**
 * Federal public holidays (month-day). Some are fixed, others vary by year.
 * This list covers fixed-date federal holidays. Easter/variable holidays
 * are computed at runtime.
 */
export const FEDERAL_HOLIDAYS_FIXED: Array<{ month: number; day: number; name: string }> = [
  { month: 1, day: 1, name: "New Year's Day" },
  { month: 1, day: 26, name: 'Australia Day' },
  { month: 4, day: 25, name: 'Anzac Day' },
  { month: 12, day: 25, name: 'Christmas Day' },
  { month: 12, day: 26, name: 'Boxing Day' },
];

// ─── Route Dependencies ────────────────────────────────────────────────────

export interface TaxCalendarRouteDeps {
  TaxDeadlineModel: import('mongoose').Model<ITaxDeadlineDocument>;
  DeadlineReminderModel: import('mongoose').Model<IDeadlineReminderDocument>;
  OrderModel: import('mongoose').Model<any>;
  UserModel: import('mongoose').Model<any>;
  authenticate: () => import('express').RequestHandler;
  checkPermission: import('@nugen/rbac').CheckPermissionFn;
}
