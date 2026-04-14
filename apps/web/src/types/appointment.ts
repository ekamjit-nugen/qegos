export interface Appointment {
  _id: string;
  orderId?: string;
  userId: string;
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  type: 'in_person' | 'phone' | 'video';
  meetingLink?: string;
  status:
    | 'scheduled'
    | 'confirmed'
    | 'completed'
    | 'no_show'
    | 'cancelled'
    | 'rescheduled';
  notes?: string;
  createdAt: string;
}

export const APPOINTMENT_STATUS_LABELS: Record<Appointment['status'], string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  completed: 'Completed',
  no_show: 'No Show',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
};

export const APPOINTMENT_STATUS_COLORS: Record<Appointment['status'], string> = {
  scheduled: 'blue',
  confirmed: 'green',
  completed: 'green',
  no_show: 'red',
  cancelled: 'red',
  rescheduled: 'orange',
};

// ─── Available Slot ────────────────────────────────────────────────────────

export interface AvailableSlot {
  date: string;
  startTime: string;
  endTime: string;
  staffId: string;
}

export interface BookAppointmentRequest {
  orderId: string;
  staffId: string;
  date: string;
  startTime: string;
  type: 'in_person' | 'phone' | 'video';
}

export interface BookAppointmentResult {
  appointmentId: string;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  status: string;
}
