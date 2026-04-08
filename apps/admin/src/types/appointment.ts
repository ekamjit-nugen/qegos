export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'no_show'
  | 'cancelled'
  | 'rescheduled';

export type AppointmentType = 'in_person' | 'phone' | 'video';

export const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'completed',
  'no_show',
  'cancelled',
  'rescheduled',
];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  completed: 'Completed',
  no_show: 'No Show',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
};

export const APPOINTMENT_STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled: 'blue',
  confirmed: 'green',
  completed: 'green',
  no_show: 'red',
  cancelled: 'red',
  rescheduled: 'orange',
};

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  in_person: 'In Person',
  phone: 'Phone',
  video: 'Video',
};

export interface Appointment {
  _id: string;
  orderId?: string;
  userId: string;
  staffId: string;
  date: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  type: AppointmentType;
  meetingLink?: string;
  status: AppointmentStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: AppointmentStatus;
  type?: AppointmentType;
  staffId?: string;
  dateFrom?: string;
  dateTo?: string;
}
