import type { Model, Document } from 'mongoose';
import type {
  IAppointmentDocument,
  IStaffAvailabilityDocument,
  AppointmentListQuery,
  AppointmentStatus,
  AvailableSlot,
  CalendarDayEntry,
} from './appointment.types';
import { ACTIVE_STATUSES, STATUS_TRANSITIONS, TERMINAL_STATUSES, timesOverlap, timeToMinutes } from './appointment.types';

interface AppointmentServiceDeps {
  AppointmentModel: Model<IAppointmentDocument>;
  StaffAvailabilityModel: Model<IStaffAvailabilityDocument>;
  OrderModel: Model<Document>;
  UserModel: Model<Document>;
  notificationSend?: (params: Record<string, unknown>) => Promise<unknown>;
}

export interface AppointmentServiceResult {
  createAppointment: (data: Record<string, unknown>, actorUserId: string) => Promise<IAppointmentDocument>;
  getAppointment: (id: string, scopeFilter?: Record<string, unknown>) => Promise<IAppointmentDocument | null>;
  listAppointments: (query: AppointmentListQuery) => Promise<{ appointments: IAppointmentDocument[]; total: number; page: number; limit: number }>;
  updateAppointment: (id: string, data: Record<string, unknown>, scopeFilter?: Record<string, unknown>) => Promise<IAppointmentDocument | null>;
  transitionStatus: (id: string, newStatus: AppointmentStatus, scopeFilter?: Record<string, unknown>) => Promise<IAppointmentDocument>;
  softDelete: (id: string, scopeFilter?: Record<string, unknown>) => Promise<IAppointmentDocument | null>;
  getStaffAvailability: (staffId: string, dateFrom: string, dateTo: string) => Promise<AvailableSlot[]>;
  setStaffAvailability: (staffId: string, data: Record<string, unknown>) => Promise<IStaffAvailabilityDocument>;
  getUpcomingAppointments: (userId: string) => Promise<IAppointmentDocument[]>;
  getCalendarView: (dateFrom: string, dateTo: string, staffId?: string) => Promise<CalendarDayEntry[]>;
  processReminders: () => Promise<number>;
  markNoShows: () => Promise<number>;
}

export function createAppointmentService(deps: AppointmentServiceDeps): AppointmentServiceResult {
  const { AppointmentModel, StaffAvailabilityModel, OrderModel, notificationSend } = deps;

  /**
   * APT-INV-01: Check for overlapping appointments for the same staff on the same date.
   */
  async function checkOverlap(
    staffId: string,
    date: Date,
    startTime: string,
    endTime: string,
    excludeId?: string,
  ): Promise<void> {
    const dateStart = new Date(date);
    dateStart.setUTCHours(0, 0, 0, 0);
    const dateEnd = new Date(date);
    dateEnd.setUTCHours(23, 59, 59, 999);

    const filter: Record<string, unknown> = {
      staffId,
      date: { $gte: dateStart, $lte: dateEnd },
      status: { $in: ACTIVE_STATUSES },
      isDeleted: { $ne: true },
    };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    const existing = await AppointmentModel.find(filter).lean();

    for (const appt of existing) {
      if (timesOverlap(startTime, endTime, appt.startTime, appt.endTime)) {
        const error = new Error('Double-booking: staff already has an appointment at this time');
        (error as Error & { status: number; code: string }).status = 409;
        (error as Error & { status: number; code: string }).code = 'APPOINTMENT_OVERLAP';
        throw error;
      }
    }
  }

  /**
   * Sync appointment data back to Order.scheduledAppointment embedded field.
   */
  async function syncOrderAppointment(appointment: IAppointmentDocument): Promise<void> {
    if (!appointment.orderId) return;
    try {
      await OrderModel.findByIdAndUpdate(appointment.orderId, {
        scheduledAppointment: {
          date: appointment.date,
          timeSlot: `${appointment.startTime}-${appointment.endTime}`,
          staffId: appointment.staffId,
          type: appointment.type,
          meetingLink: appointment.meetingLink ?? undefined,
          // Map extended status to legacy 4-status set
          status: TERMINAL_STATUSES.includes(appointment.status)
            ? appointment.status
            : 'scheduled',
        },
      });
    } catch {
      // Log but don't fail the primary operation — eventual consistency
    }
  }

  // ─── CRUD ───────────────────────────────────────────────────────────────

  async function createAppointment(
    data: Record<string, unknown>,
    _actorUserId: string,
  ): Promise<IAppointmentDocument> {
    const staffId = data.staffId as string;
    const date = new Date(data.date as string);
    const startTime = data.startTime as string;
    const endTime = data.endTime as string;

    // APT-INV-01: Double-booking prevention
    await checkOverlap(staffId, date, startTime, endTime);

    // Validate order exists if provided
    if (data.orderId) {
      const order = await OrderModel.findById(data.orderId);
      if (!order) {
        const error = new Error('Order not found');
        (error as Error & { status: number }).status = 404;
        throw error;
      }
    }

    const appointment = await AppointmentModel.create({
      orderId: data.orderId ?? undefined,
      userId: data.userId,
      staffId: data.staffId,
      date,
      startTime,
      endTime,
      type: data.type,
      meetingLink: data.meetingLink ?? undefined,
      notes: data.notes ?? undefined,
      status: 'scheduled',
    });

    // Sync to Order if linked
    await syncOrderAppointment(appointment);

    return appointment;
  }

  async function getAppointment(
    id: string,
    scopeFilter?: Record<string, unknown>,
  ): Promise<IAppointmentDocument | null> {
    const filter: Record<string, unknown> = { _id: id, ...scopeFilter };
    return AppointmentModel.findOne(filter)
      .populate('userId', 'firstName lastName email')
      .populate('staffId', 'firstName lastName email');
  }

  async function listAppointments(
    query: AppointmentListQuery,
  ): Promise<{ appointments: IAppointmentDocument[]; total: number; page: number; limit: number }> {
    const filter: Record<string, unknown> = {};
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    if (query.dateFrom || query.dateTo) {
      filter.date = {};
      if (query.dateFrom) (filter.date as Record<string, unknown>).$gte = new Date(query.dateFrom);
      if (query.dateTo) (filter.date as Record<string, unknown>).$lte = new Date(query.dateTo);
    }
    if (query.staffId) filter.staffId = query.staffId;
    if (query.userId) filter.userId = query.userId;
    if (query.status) filter.status = query.status;
    if (query.orderId) filter.orderId = query.orderId;

    const [appointments, total] = await Promise.all([
      AppointmentModel.find(filter)
        .populate('userId', 'firstName lastName email')
        .populate('staffId', 'firstName lastName email')
        .sort({ date: 1, startTime: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      AppointmentModel.countDocuments(filter),
    ]);

    return { appointments, total, page, limit };
  }

  async function updateAppointment(
    id: string,
    data: Record<string, unknown>,
    scopeFilter?: Record<string, unknown>,
  ): Promise<IAppointmentDocument | null> {
    const appointment = await AppointmentModel.findOne({ _id: id, ...scopeFilter });
    if (!appointment) return null;

    // Don't allow updating terminal appointments
    if (TERMINAL_STATUSES.includes(appointment.status)) {
      const error = new Error(`Cannot update appointment in ${appointment.status} status`);
      (error as Error & { status: number }).status = 400;
      throw error;
    }

    // Strip status from update — use transitionStatus instead
    delete data.status;

    // If time/date changed, re-check overlap
    const newDate = data.date ? new Date(data.date as string) : appointment.date;
    const newStart = (data.startTime as string) ?? appointment.startTime;
    const newEnd = (data.endTime as string) ?? appointment.endTime;

    if (data.date || data.startTime || data.endTime) {
      await checkOverlap(
        String(appointment.staffId),
        newDate,
        newStart,
        newEnd,
        id,
      );
    }

    // Validate endTime > startTime for partial updates
    if (timeToMinutes(newEnd) <= timeToMinutes(newStart)) {
      const error = new Error('endTime must be after startTime');
      (error as Error & { status: number }).status = 400;
      throw error;
    }

    const allowedFields = ['date', 'startTime', 'endTime', 'type', 'meetingLink', 'notes'];
    const update: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        update[key] = key === 'date' ? new Date(data[key] as string) : data[key];
      }
    }

    const updated = await AppointmentModel.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (updated) await syncOrderAppointment(updated);
    return updated;
  }

  async function transitionStatus(
    id: string,
    newStatus: AppointmentStatus,
    scopeFilter?: Record<string, unknown>,
  ): Promise<IAppointmentDocument> {
    const appointment = await AppointmentModel.findOne({ _id: id, ...scopeFilter });
    if (!appointment) {
      const error = new Error('Appointment not found');
      (error as Error & { status: number }).status = 404;
      throw error;
    }

    const allowed = STATUS_TRANSITIONS[appointment.status];
    if (!allowed.includes(newStatus)) {
      const error = new Error(
        `Cannot transition from "${appointment.status}" to "${newStatus}". Allowed: ${allowed.join(', ') || 'none (terminal)'}`,
      );
      (error as Error & { status: number }).status = 400;
      throw error;
    }

    appointment.status = newStatus;
    await appointment.save();
    await syncOrderAppointment(appointment);

    return appointment;
  }

  async function softDelete(
    id: string,
    scopeFilter?: Record<string, unknown>,
  ): Promise<IAppointmentDocument | null> {
    return AppointmentModel.findOneAndUpdate(
      { _id: id, ...scopeFilter },
      { $set: { isDeleted: true, deletedAt: new Date() } },
      { new: true },
    );
  }

  // ─── Staff Availability ─────────────────────────────────────────────────

  async function getStaffAvailability(
    staffId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<AvailableSlot[]> {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);

    // Get recurring working hours for this staff
    const recurring = await StaffAvailabilityModel.find({
      staffId,
      isBlocked: false,
      isDeleted: { $ne: true },
    }).lean();

    // Get one-off blocks
    const blocks = await StaffAvailabilityModel.find({
      staffId,
      isBlocked: true,
      blockDate: { $gte: from, $lte: to },
      isDeleted: { $ne: true },
    }).lean();

    // Get existing booked appointments in range
    const booked = await AppointmentModel.find({
      staffId,
      date: { $gte: from, $lte: to },
      status: { $in: ACTIVE_STATUSES },
      isDeleted: { $ne: true },
    }).lean();

    const slots: AvailableSlot[] = [];

    // Iterate each day in range
    const current = new Date(from);
    while (current <= to) {
      const dayOfWeek = current.getUTCDay();
      const dateStr = current.toISOString().split('T')[0];

      // Find recurring availability for this day of week
      const daySlots = recurring.filter((r) => r.dayOfWeek === dayOfWeek);

      // Check for blocks on this specific date
      const dayBlocks = blocks.filter(
        (b) => b.blockDate && b.blockDate.toISOString().split('T')[0] === dateStr,
      );

      // Check booked appointments on this date
      const dayBooked = booked.filter(
        (a) => a.date.toISOString().split('T')[0] === dateStr,
      );

      for (const slot of daySlots) {
        // Check if this slot is blocked
        const isBlocked = dayBlocks.some((b) =>
          timesOverlap(slot.startTime, slot.endTime, b.startTime, b.endTime),
        );
        if (isBlocked) continue;

        // Check if fully booked
        const isBooked = dayBooked.some((a) =>
          timesOverlap(slot.startTime, slot.endTime, a.startTime, a.endTime),
        );
        if (isBooked) continue;

        slots.push({
          date: dateStr,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });
      }

      current.setUTCDate(current.getUTCDate() + 1);
    }

    return slots;
  }

  async function setStaffAvailability(
    staffId: string,
    data: Record<string, unknown>,
  ): Promise<IStaffAvailabilityDocument> {
    const isBlock = data.isBlocked === true;

    if (isBlock && data.blockDate) {
      // One-off block — always create new
      return StaffAvailabilityModel.create({
        staffId,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        isBlocked: true,
        blockDate: new Date(data.blockDate as string),
        blockReason: data.blockReason ?? undefined,
      });
    }

    // Recurring availability — upsert by staffId + dayOfWeek
    const updated = await StaffAvailabilityModel.findOneAndUpdate(
      { staffId, dayOfWeek: data.dayOfWeek, isBlocked: false, isDeleted: { $ne: true } },
      {
        $set: {
          startTime: data.startTime,
          endTime: data.endTime,
        },
        $setOnInsert: { staffId, dayOfWeek: data.dayOfWeek, isBlocked: false },
      },
      { new: true, upsert: true },
    );

    return updated;
  }

  // ─── User-facing Queries ────────────────────────────────────────────────

  async function getUpcomingAppointments(userId: string): Promise<IAppointmentDocument[]> {
    const now = new Date();
    return AppointmentModel.find({
      userId,
      date: { $gte: now },
      status: { $in: ACTIVE_STATUSES },
    })
      .populate('staffId', 'firstName lastName email')
      .sort({ date: 1, startTime: 1 })
      .limit(20);
  }

  async function getCalendarView(
    dateFrom: string,
    dateTo: string,
    staffId?: string,
  ): Promise<CalendarDayEntry[]> {
    const filter: Record<string, unknown> = {
      date: { $gte: new Date(dateFrom), $lte: new Date(dateTo) },
    };
    if (staffId) filter.staffId = staffId;

    const appointments = await AppointmentModel.find(filter)
      .populate('userId', 'firstName lastName email')
      .populate('staffId', 'firstName lastName email')
      .sort({ date: 1, startTime: 1 });

    // Group by date
    const dayMap = new Map<string, IAppointmentDocument[]>();
    for (const appt of appointments) {
      const dateStr = appt.date.toISOString().split('T')[0];
      if (!dayMap.has(dateStr)) dayMap.set(dateStr, []);
      dayMap.get(dateStr)!.push(appt);
    }

    const result: CalendarDayEntry[] = [];
    for (const [date, appts] of dayMap) {
      result.push({ date, count: appts.length, appointments: appts });
    }

    return result;
  }

  // ─── BullMQ Handlers ───────────────────────────────────────────────────

  /**
   * APT-INV-02: Process appointment reminders.
   * 24hr before → email, 2hr before → push+SMS.
   */
  async function processReminders(): Promise<number> {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // Find appointments in next 24h that are active
    const upcoming = await AppointmentModel.find({
      status: { $in: ACTIVE_STATUSES },
      date: { $lte: in24h },
      isDeleted: { $ne: true },
    });

    let sent = 0;

    for (const appt of upcoming) {
      const apptTime = new Date(appt.date);
      const [hours, minutes] = appt.startTime.split(':').map(Number);
      apptTime.setUTCHours(hours, minutes, 0, 0);

      const msUntil = apptTime.getTime() - now.getTime();

      // 24h email reminder (send when <= 24h away and not yet sent)
      if (msUntil <= 24 * 60 * 60 * 1000 && msUntil > 0 && !appt.remindersSent.includes('24h_email')) {
        if (notificationSend) {
          try {
            await notificationSend({
              recipientId: String(appt.userId),
              type: 'deadline_reminder',
              channels: ['email'],
              content: {
                title: 'Appointment Reminder — Tomorrow',
                body: `Your ${appt.type} appointment is on ${appt.date.toISOString().split('T')[0]} at ${appt.startTime} UTC.`,
              },
              relatedResourceType: 'appointment',
              relatedResourceId: String(appt._id),
            });
          } catch {
            // Log but continue
          }
        }
        appt.remindersSent.push('24h_email');
        await appt.save();
        sent++;
      }

      // 2h push+SMS reminder
      if (msUntil <= 2 * 60 * 60 * 1000 && msUntil > 0 && !appt.remindersSent.includes('2h_push_sms')) {
        if (notificationSend) {
          try {
            await notificationSend({
              recipientId: String(appt.userId),
              type: 'deadline_reminder',
              channels: ['push', 'sms'],
              content: {
                title: 'Appointment in 2 Hours',
                body: `Your ${appt.type} appointment starts at ${appt.startTime} UTC today.${appt.meetingLink ? ` Join: ${appt.meetingLink}` : ''}`,
              },
              relatedResourceType: 'appointment',
              relatedResourceId: String(appt._id),
            });
          } catch {
            // Log but continue
          }
        }
        appt.remindersSent.push('2h_push_sms');
        await appt.save();
        sent++;
      }
    }

    return sent;
  }

  /**
   * APT-INV-03: Auto-mark no-show 30min after appointment end time.
   * Sends re-scheduling prompt to client.
   */
  async function markNoShows(): Promise<number> {
    const now = new Date();
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);

    // Find active appointments whose date+endTime is >= 30min in the past
    const candidates = await AppointmentModel.find({
      status: { $in: ACTIVE_STATUSES },
      date: { $lte: thirtyMinAgo },
      isDeleted: { $ne: true },
    });

    let marked = 0;

    for (const appt of candidates) {
      // Calculate actual end datetime
      const endDateTime = new Date(appt.date);
      const [hours, minutes] = appt.endTime.split(':').map(Number);
      endDateTime.setUTCHours(hours, minutes, 0, 0);

      // Only mark if 30+ minutes past end time
      if (endDateTime.getTime() + 30 * 60 * 1000 > now.getTime()) continue;

      appt.status = 'no_show';
      appt.noShowFollowUp = true;
      await appt.save();
      await syncOrderAppointment(appt);

      // Send re-scheduling prompt
      if (notificationSend) {
        try {
          await notificationSend({
            recipientId: String(appt.userId),
            type: 'deadline_reminder',
            channels: ['email', 'push'],
            content: {
              title: 'Missed Appointment',
              body: `You missed your ${appt.type} appointment on ${appt.date.toISOString().split('T')[0]} at ${appt.startTime} UTC. Please reschedule at your earliest convenience.`,
            },
            relatedResourceType: 'appointment',
            relatedResourceId: String(appt._id),
          });
        } catch {
          // Log but continue
        }
      }

      marked++;
    }

    return marked;
  }

  return {
    createAppointment,
    getAppointment,
    listAppointments,
    updateAppointment,
    transitionStatus,
    softDelete,
    getStaffAvailability,
    setStaffAvailability,
    getUpcomingAppointments,
    getCalendarView,
    processReminders,
    markNoShows,
  };
}
