import type { Types, Document } from 'mongoose';

// ─── Enums ──────────────────────────────────────────────────────────────────

/** Appointment types (reuses order.types values + extends) */
export const APPOINTMENT_TYPES = ['in_person', 'phone', 'video'] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

/** Extended statuses beyond order.types (adds confirmed + rescheduled) */
export const APPOINTMENT_STATUSES = [
  'scheduled',
  'confirmed',
  'completed',
  'no_show',
  'cancelled',
  'rescheduled',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Terminal statuses — no further transitions allowed */
export const TERMINAL_STATUSES: AppointmentStatus[] = ['completed', 'no_show', 'cancelled'];

/** Active statuses — used for overlap checks and reminder queries */
export const ACTIVE_STATUSES: AppointmentStatus[] = ['scheduled', 'confirmed'];

/**
 * Status transition map — defines valid next states from each status.
 * Terminal statuses have no outgoing transitions.
 */
export const STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ['confirmed', 'cancelled', 'rescheduled'],
  confirmed: ['completed', 'no_show', 'cancelled', 'rescheduled'],
  rescheduled: ['confirmed', 'cancelled'],
  completed: [],
  no_show: [],
  cancelled: [],
};

/** Reminder identifiers tracked in remindersSent[] */
export const REMINDER_TYPES = ['24h_email', '2h_push_sms'] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface IAppointment {
  orderId?: Types.ObjectId;
  userId: Types.ObjectId;
  staffId: Types.ObjectId;
  date: Date;
  startTime: string; // HH:mm UTC
  endTime: string;   // HH:mm UTC
  type: AppointmentType;
  meetingLink?: string;
  status: AppointmentStatus;
  remindersSent: string[];
  noShowFollowUp: boolean;
  notes?: string;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAppointmentDocument extends IAppointment, Document {}

export interface IStaffAvailability {
  staffId: Types.ObjectId;
  dayOfWeek: number; // 0=Sun, 6=Sat
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  isBlocked: boolean;
  blockDate?: Date;   // specific date for one-off blocks
  blockReason?: string;
  isDeleted: boolean;
}

export interface IStaffAvailabilityDocument extends IStaffAvailability, Document {}

// ─── Query / Result Types ───────────────────────────────────────────────────

export interface AppointmentListQuery {
  dateFrom?: string;
  dateTo?: string;
  staffId?: string;
  userId?: string;
  status?: AppointmentStatus;
  orderId?: string;
  page?: number;
  limit?: number;
}

export interface AvailableSlot {
  date: string;       // ISO date string
  startTime: string;  // HH:mm
  endTime: string;    // HH:mm
}

export interface CalendarDayEntry {
  date: string;
  count: number;
  appointments: IAppointmentDocument[];
}

// ─── Route Dependencies ─────────────────────────────────────────────────────

export interface AppointmentRouteDeps {
  AppointmentModel: import('mongoose').Model<IAppointmentDocument>;
  StaffAvailabilityModel: import('mongoose').Model<IStaffAvailabilityDocument>;
  OrderModel: import('mongoose').Model<Document>;
  UserModel: import('mongoose').Model<Document>;
  authenticate: () => import('express').RequestHandler;
  checkPermission: (resource: string, action: string) => import('express').RequestHandler;
  notificationSend?: (params: Record<string, unknown>) => Promise<unknown>;
  /** Optional: provide a function to read platform settings (e.g. slot duration) */
  getSetting?: (key: string) => Promise<unknown>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert HH:mm to minutes since midnight for numeric comparison */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Check if two time ranges overlap (exclusive endpoints) */
export function timesOverlap(
  startA: string, endA: string,
  startB: string, endB: string,
): boolean {
  const a0 = timeToMinutes(startA);
  const a1 = timeToMinutes(endA);
  const b0 = timeToMinutes(startB);
  const b1 = timeToMinutes(endB);
  return a0 < b1 && a1 > b0;
}
