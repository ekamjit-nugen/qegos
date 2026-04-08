import {
  APPOINTMENT_TYPES,
  APPOINTMENT_STATUSES,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  STATUS_TRANSITIONS,
  REMINDER_TYPES,
  timeToMinutes,
  timesOverlap,
} from '../appointment.types';

import {
  createAppointmentValidation,
  updateAppointmentValidation,
  statusTransitionValidation,
  listAppointmentValidation,
  appointmentIdValidation,
  staffAvailabilityValidation,
  availabilityQueryValidation,
} from '../appointment.validators';

import { createAppointmentRoutes } from '../appointment.routes';

// ─── Type Constants ─────────────────────────────────────────────────────────

describe('Appointment Scheduling — Types & Constants', () => {
  test('APPOINTMENT_TYPES contains in_person, phone, video', () => {
    expect(APPOINTMENT_TYPES).toEqual(['in_person', 'phone', 'video']);
  });

  test('APPOINTMENT_STATUSES has 6 states including confirmed and rescheduled', () => {
    expect(APPOINTMENT_STATUSES).toHaveLength(6);
    expect(APPOINTMENT_STATUSES).toContain('scheduled');
    expect(APPOINTMENT_STATUSES).toContain('confirmed');
    expect(APPOINTMENT_STATUSES).toContain('completed');
    expect(APPOINTMENT_STATUSES).toContain('no_show');
    expect(APPOINTMENT_STATUSES).toContain('cancelled');
    expect(APPOINTMENT_STATUSES).toContain('rescheduled');
  });

  test('ACTIVE_STATUSES includes scheduled and confirmed', () => {
    expect(ACTIVE_STATUSES).toEqual(['scheduled', 'confirmed']);
  });

  test('TERMINAL_STATUSES includes completed, no_show, cancelled', () => {
    expect(TERMINAL_STATUSES).toEqual(['completed', 'no_show', 'cancelled']);
  });

  test('REMINDER_TYPES has 24h_email and 2h_push_sms', () => {
    expect(REMINDER_TYPES).toEqual(['24h_email', '2h_push_sms']);
  });
});

// ─── Status Transitions ─────────────────────────────────────────────────────

describe('Appointment Scheduling — Status Transitions', () => {
  test('scheduled can transition to confirmed, cancelled, rescheduled', () => {
    expect(STATUS_TRANSITIONS.scheduled).toEqual(['confirmed', 'cancelled', 'rescheduled']);
  });

  test('confirmed can transition to completed, no_show, cancelled, rescheduled', () => {
    expect(STATUS_TRANSITIONS.confirmed).toEqual(['completed', 'no_show', 'cancelled', 'rescheduled']);
  });

  test('rescheduled can transition to confirmed or cancelled', () => {
    expect(STATUS_TRANSITIONS.rescheduled).toEqual(['confirmed', 'cancelled']);
  });

  test('terminal statuses have no outgoing transitions', () => {
    expect(STATUS_TRANSITIONS.completed).toEqual([]);
    expect(STATUS_TRANSITIONS.no_show).toEqual([]);
    expect(STATUS_TRANSITIONS.cancelled).toEqual([]);
  });

  test('every status in APPOINTMENT_STATUSES has a transition entry', () => {
    for (const status of APPOINTMENT_STATUSES) {
      expect(STATUS_TRANSITIONS).toHaveProperty(status);
    }
  });
});

// ─── Time Helpers ───────────────────────────────────────────────────────────

describe('Appointment Scheduling — Time Helpers', () => {
  test('timeToMinutes converts HH:mm correctly', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('12:00')).toBe(720);
    expect(timeToMinutes('23:59')).toBe(1439);
    expect(timeToMinutes('14:15')).toBe(855);
  });

  test('timesOverlap detects overlapping time ranges', () => {
    // Fully overlapping
    expect(timesOverlap('09:00', '10:00', '09:00', '10:00')).toBe(true);
    // Partial overlap
    expect(timesOverlap('09:00', '10:00', '09:30', '10:30')).toBe(true);
    expect(timesOverlap('09:30', '10:30', '09:00', '10:00')).toBe(true);
    // One inside another
    expect(timesOverlap('09:00', '12:00', '10:00', '11:00')).toBe(true);
  });

  test('timesOverlap returns false for non-overlapping ranges', () => {
    // Adjacent (no overlap — endpoints exclusive)
    expect(timesOverlap('09:00', '10:00', '10:00', '11:00')).toBe(false);
    // Gap between
    expect(timesOverlap('09:00', '10:00', '11:00', '12:00')).toBe(false);
    // Reversed order
    expect(timesOverlap('14:00', '15:00', '09:00', '10:00')).toBe(false);
  });

  test('timesOverlap edge case: same start, different end', () => {
    expect(timesOverlap('09:00', '10:00', '09:00', '09:30')).toBe(true);
  });
});

// ─── Validators ─────────────────────────────────────────────────────────────

describe('Appointment Scheduling — Validators', () => {
  test('createAppointmentValidation returns 9 validators', () => {
    expect(createAppointmentValidation()).toHaveLength(9);
  });

  test('updateAppointmentValidation returns 7 validators', () => {
    expect(updateAppointmentValidation()).toHaveLength(7);
  });

  test('statusTransitionValidation returns 2 validators', () => {
    expect(statusTransitionValidation()).toHaveLength(2);
  });

  test('listAppointmentValidation returns 8 validators', () => {
    expect(listAppointmentValidation()).toHaveLength(8);
  });

  test('appointmentIdValidation returns 1 validator', () => {
    expect(appointmentIdValidation()).toHaveLength(1);
  });

  test('staffAvailabilityValidation returns 7 validators', () => {
    expect(staffAvailabilityValidation()).toHaveLength(7);
  });

  test('availabilityQueryValidation returns 3 validators', () => {
    expect(availabilityQueryValidation()).toHaveLength(3);
  });
});

// ─── Routes ─────────────────────────────────────────────────────────────────

describe('Appointment Scheduling — Routes', () => {
  test('createAppointmentRoutes is exported as a function', () => {
    expect(typeof createAppointmentRoutes).toBe('function');
  });
});

// ─── Invariant Summary ──────────────────────────────────────────────────────

describe('Appointment Scheduling — Invariants', () => {
  test('APT-INV-01: double-booking uses time overlap check', () => {
    // Overlapping slot returns true → would be rejected
    expect(timesOverlap('09:00', '10:00', '09:30', '10:30')).toBe(true);
    // Non-overlapping returns false → allowed
    expect(timesOverlap('09:00', '10:00', '10:00', '11:00')).toBe(false);
  });

  test('APT-INV-02: reminder types exist for 24h email and 2h push+SMS', () => {
    expect(REMINDER_TYPES).toContain('24h_email');
    expect(REMINDER_TYPES).toContain('2h_push_sms');
  });

  test('APT-INV-03: no_show is a valid status with no outgoing transitions', () => {
    expect(APPOINTMENT_STATUSES).toContain('no_show');
    expect(STATUS_TRANSITIONS.no_show).toEqual([]);
  });

  test('APT-INV-04: appointments support all 3 types including video (for meeting links)', () => {
    expect(APPOINTMENT_TYPES).toContain('video');
    expect(APPOINTMENT_TYPES).toContain('phone');
    expect(APPOINTMENT_TYPES).toContain('in_person');
  });
});
