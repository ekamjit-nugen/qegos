import { Schema, type Connection, type Model } from 'mongoose';
import type { IAppointmentDocument, IStaffAvailabilityDocument } from './appointment.types';
import { APPOINTMENT_TYPES, APPOINTMENT_STATUSES } from './appointment.types';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// ─── Appointment Schema ─────────────────────────────────────────────────────

const appointmentSchema = new Schema<IAppointmentDocument>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true, index: true },
    startTime: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => TIME_REGEX.test(v),
        message: 'startTime must be HH:mm',
      },
    },
    endTime: {
      type: String,
      required: true,
      validate: { validator: (v: string) => TIME_REGEX.test(v), message: 'endTime must be HH:mm' },
    },
    type: { type: String, enum: [...APPOINTMENT_TYPES], required: true },
    meetingLink: { type: String },
    status: { type: String, enum: [...APPOINTMENT_STATUSES], default: 'scheduled' },
    remindersSent: { type: [String], default: [] },
    noShowFollowUp: { type: Boolean, default: false },
    notes: { type: String },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

// Compound index for double-booking prevention (APT-INV-01)
appointmentSchema.index(
  { staffId: 1, date: 1, startTime: 1 },
  { partialFilterExpression: { isDeleted: false, status: { $nin: ['cancelled', 'rescheduled'] } } },
);

// Query for upcoming reminders
appointmentSchema.index({ status: 1, date: 1 });

// Soft-delete query middleware
function addSoftDeleteFilter(
  this: {
    getFilter: () => Record<string, unknown>;
    setQuery: (f: Record<string, unknown>) => void;
  },
  next: () => void,
): void {
  const filter = this.getFilter();
  if (filter.isDeleted === undefined) {
    (filter as Record<string, unknown>).isDeleted = { $ne: true };
    this.setQuery(filter);
  }
  next();
}

appointmentSchema.pre('find', addSoftDeleteFilter);
appointmentSchema.pre('findOne', addSoftDeleteFilter);
appointmentSchema.pre('countDocuments', addSoftDeleteFilter);

// ─── Staff Availability Schema ──────────────────────────────────────────────

const staffAvailabilitySchema = new Schema<IStaffAvailabilityDocument>(
  {
    staffId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    startTime: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => TIME_REGEX.test(v),
        message: 'startTime must be HH:mm',
      },
    },
    endTime: {
      type: String,
      required: true,
      validate: { validator: (v: string) => TIME_REGEX.test(v), message: 'endTime must be HH:mm' },
    },
    isBlocked: { type: Boolean, default: false },
    blockDate: { type: Date },
    blockReason: { type: String },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Recurring availability: one entry per staff per day-of-week
staffAvailabilitySchema.index({ staffId: 1, dayOfWeek: 1 });
// One-off blocks by date
staffAvailabilitySchema.index({ staffId: 1, blockDate: 1 });

staffAvailabilitySchema.pre('find', addSoftDeleteFilter);
staffAvailabilitySchema.pre('findOne', addSoftDeleteFilter);
staffAvailabilitySchema.pre('countDocuments', addSoftDeleteFilter);

// ─── Model Factories ────────────────────────────────────────────────────────

export function createAppointmentModel(connection: Connection): Model<IAppointmentDocument> {
  return connection.model<IAppointmentDocument>('Appointment', appointmentSchema);
}

export function createStaffAvailabilityModel(
  connection: Connection,
): Model<IStaffAvailabilityDocument> {
  return connection.model<IStaffAvailabilityDocument>('StaffAvailability', staffAvailabilitySchema);
}
