/**
 * Client-facing Appointment Booking Routes
 *
 * Allows authenticated clients to:
 * 1. View available appointment slots
 * 2. Book an appointment linked to their order
 * 3. Reschedule an existing appointment (with collision check)
 * 4. Cancel an appointment
 */

import { Router, type Request, type Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import * as _auditLog from '@nugen/audit-log';
import { getRequestId } from '../../lib/requestContext';

const auditLog = {
  log: (params: Record<string, unknown>): void => {
    _auditLog.log({ ...params, requestId: getRequestId() } as never).catch(() => {
      // fire-and-forget: audit log failure is non-critical
    });
  },
};
import type { Model, Document } from 'mongoose';
import type { IAppointmentDocument, IStaffAvailabilityDocument } from '../appointment-scheduling/appointment.types';
import { createAppointmentService } from '../appointment-scheduling/appointment.service';
import type { IOrderDocument2 } from '../order-management/order.types';

// ─── Types ─────────────────────────────────────────────────────────────────

interface AuthRequest extends Request {
  user?: { _id: string; userId: string; userType?: number };
}

export interface AppointmentBookingRouteDeps {
  AppointmentModel: Model<IAppointmentDocument>;
  StaffAvailabilityModel: Model<IStaffAvailabilityDocument>;
  OrderModel: Model<IOrderDocument2>;
  UserModel: Model<Document>;
  authenticate: () => import('express').RequestHandler;
  getSetting?: (key: string) => Promise<unknown>;
}

// ─── Validators ────────────────────────────────────────────────────────────

const availableSlotsValidation = [
  query('dateFrom').isISO8601().withMessage('dateFrom must be a valid ISO 8601 date'),
  query('dateTo').isISO8601().withMessage('dateTo must be a valid ISO 8601 date'),
  query('staffId').optional().isMongoId().withMessage('staffId must be a valid ID'),
];

const bookAppointmentValidation = [
  body('orderId').isMongoId().withMessage('Valid order ID is required'),
  body('staffId').isMongoId().withMessage('Valid staff ID is required'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('startTime')
    .matches(/^([01]\d|2[0-3]):[0-5]\d$/)
    .withMessage('startTime must be HH:mm format'),
  body('type')
    .isIn(['in_person', 'phone', 'video'])
    .withMessage('Type must be in_person, phone, or video'),
];

const rescheduleValidation = [
  param('id').isMongoId().withMessage('Valid appointment ID is required'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('startTime')
    .matches(/^([01]\d|2[0-3]):[0-5]\d$/)
    .withMessage('startTime must be HH:mm format'),
  body('type')
    .optional()
    .isIn(['in_person', 'phone', 'video'])
    .withMessage('Type must be in_person, phone, or video'),
];

const cancelValidation = [
  param('id').isMongoId().withMessage('Valid appointment ID is required'),
];

// ─── Route Factory ─────────────────────────────────────────────────────────

export function createAppointmentBookingRoutes(deps: AppointmentBookingRouteDeps): Router {
  const router = Router();
  const {
    AppointmentModel,
    StaffAvailabilityModel,
    OrderModel,
    UserModel,
    getSetting,
  } = deps;

  const appointmentService = createAppointmentService({
    AppointmentModel,
    StaffAvailabilityModel,
    OrderModel: OrderModel as unknown as Model<Document>,
    UserModel,
    getSetting,
  });

  // All routes require authentication
  const authMiddleware = typeof deps.authenticate === 'function' && deps.authenticate.length === 0
    ? (deps.authenticate as unknown as () => import('express').RequestHandler)()
    : deps.authenticate;
  router.use(authMiddleware);

  // ── GET /appointments/available-slots ─────────────────────────────────
  // Get available time slots for a date range

  router.get(
    '/appointments/available-slots',
    ...availableSlotsValidation,
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }

      try {
        const { dateFrom, dateTo, staffId } = req.query as {
          dateFrom: string;
          dateTo: string;
          staffId?: string;
        };

        if (staffId) {
          // Get slots for a specific staff member
          const slots = await appointmentService.getStaffAvailability(staffId, dateFrom, dateTo);
          res.status(200).json({
            status: 200,
            data: { slots, staffId },
          });
          return;
        }

        // If no staffId provided, get all staff with availability and return combined slots
        const allStaff = await StaffAvailabilityModel.distinct('staffId', {
          isBlocked: false,
          isDeleted: { $ne: true },
        });

        const allSlots: Array<{ date: string; startTime: string; endTime: string; staffId: string }> = [];

        for (const sid of allStaff) {
          const staffSlots = await appointmentService.getStaffAvailability(
            String(sid),
            dateFrom,
            dateTo,
          );
          for (const slot of staffSlots) {
            allSlots.push({
              ...slot,
              staffId: String(sid),
            });
          }
        }

        // Sort by date then startTime
        allSlots.sort((a, b) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          return a.startTime.localeCompare(b.startTime);
        });

        res.status(200).json({
          status: 200,
          data: { slots: allSlots },
        });
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        res.status(error.statusCode ?? 500).json({
          status: error.statusCode ?? 500,
          message: error.message,
        });
      }
    },
  );

  // ── POST /appointments/book ───────────────────────────────────────────
  // Book an appointment slot

  router.post(
    '/appointments/book',
    ...bookAppointmentValidation,
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }

      const authReq = req as AuthRequest;
      const userId = authReq.user?.userId ?? authReq.user?._id;
      if (!userId) {
        res.status(401).json({ status: 401, message: 'Authentication required' });
        return;
      }

      try {
        const { orderId, staffId, date, startTime, type } = req.body as {
          orderId: string;
          staffId: string;
          date: string;
          startTime: string;
          type: 'in_person' | 'phone' | 'video';
        };

        // Verify the order belongs to the user
        const order = await OrderModel.findOne({ _id: orderId, userId }).lean();
        if (!order) {
          res.status(404).json({ status: 404, message: 'Order not found' });
          return;
        }

        // Calculate endTime from settings
        let slotDuration = 30;
        if (getSetting) {
          try {
            const durationVal = await getSetting('appointment.slotDurationMinutes');
            if (typeof durationVal === 'number' && durationVal > 0) {
              slotDuration = durationVal;
            }
          } catch {
            // Use default
          }
        }

        const [hours, minutes] = startTime.split(':').map(Number);
        const totalMinutes = hours * 60 + minutes + slotDuration;
        const endHours = Math.floor(totalMinutes / 60);
        const endMins = totalMinutes % 60;
        const endTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

        // Create the appointment
        const appointment = await appointmentService.createAppointment(
          {
            orderId,
            userId,
            staffId,
            date,
            startTime,
            endTime,
            type,
          },
          userId,
        );

        res.status(201).json({
          status: 201,
          data: {
            appointmentId: String(appointment._id),
            date: appointment.date,
            startTime: appointment.startTime,
            endTime: appointment.endTime,
            type: appointment.type,
            status: appointment.status,
          },
        });

        auditLog.log({
          actor: userId,
          actorType: 'client',
          action: 'create',
          resource: 'appointment',
          resourceId: String(appointment._id),
          severity: 'info',
          description: `Client booked appointment ${String(appointment._id)}`,
        });
      } catch (err) {
        const error = err as Error & { statusCode?: number; code?: string };
        const statusCode = (error as { status?: number }).status ?? error.statusCode ?? 500;
        res.status(statusCode).json({
          status: statusCode,
          code: error.code,
          message: error.message,
        });
      }
    },
  );

  // ── PATCH /appointments/:id/reschedule ──────────────────────────────
  // Reschedule an appointment (client-facing, with collision check)

  router.patch(
    '/appointments/:id/reschedule',
    ...rescheduleValidation,
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }

      const authReq = req as AuthRequest;
      const userId = authReq.user?.userId ?? authReq.user?._id;
      if (!userId) {
        res.status(401).json({ status: 401, message: 'Authentication required' });
        return;
      }

      try {
        const { id } = req.params;
        const { date, startTime, type } = req.body as {
          date: string;
          startTime: string;
          type?: 'in_person' | 'phone' | 'video';
        };

        // Verify the appointment belongs to the client
        const existing = await AppointmentModel.findOne({ _id: id, userId }).lean();
        if (!existing) {
          res.status(404).json({ status: 404, message: 'Appointment not found' });
          return;
        }

        // Only allow rescheduling active appointments (scheduled, confirmed)
        if (!['scheduled', 'confirmed'].includes(existing.status)) {
          res.status(400).json({
            status: 400,
            code: 'INVALID_STATUS',
            message: `Cannot reschedule an appointment in "${existing.status}" status`,
          });
          return;
        }

        // Don't allow rescheduling to the past
        const newDate = new Date(date);
        const now = new Date();
        now.setUTCHours(0, 0, 0, 0);
        if (newDate < now) {
          res.status(400).json({
            status: 400,
            code: 'PAST_DATE',
            message: 'Cannot reschedule to a past date',
          });
          return;
        }

        // Calculate new endTime from settings
        let slotDuration = 30;
        if (getSetting) {
          try {
            const durationVal = await getSetting('appointment.slotDurationMinutes');
            if (typeof durationVal === 'number' && durationVal > 0) {
              slotDuration = durationVal;
            }
          } catch {
            // Use default
          }
        }

        const [hours, minutes] = startTime.split(':').map(Number);
        const totalMinutes = hours * 60 + minutes + slotDuration;
        const endHours = Math.floor(totalMinutes / 60);
        const endMins = totalMinutes % 60;
        const endTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

        // Update the appointment (service handles collision detection via checkOverlap)
        const updateData: Record<string, unknown> = {
          date,
          startTime,
          endTime,
        };
        if (type) updateData.type = type;

        const updated = await appointmentService.updateAppointment(id, updateData);
        if (!updated) {
          res.status(404).json({ status: 404, message: 'Appointment not found' });
          return;
        }

        // Transition status to 'rescheduled' then back to 'scheduled'
        // This marks it as rescheduled in the history
        await appointmentService.transitionStatus(id, 'rescheduled');

        res.status(200).json({
          status: 200,
          data: {
            appointmentId: String(updated._id),
            date: updated.date,
            startTime: updated.startTime,
            endTime: updated.endTime,
            type: updated.type,
            status: 'rescheduled',
          },
        });

        auditLog.log({
          actor: userId,
          actorType: 'client',
          action: 'update',
          resource: 'appointment',
          resourceId: id,
          severity: 'info',
          description: `Client rescheduled appointment ${id} to ${date} ${startTime}`,
        });
      } catch (err) {
        const error = err as Error & { status?: number; statusCode?: number; code?: string };
        const statusCode = error.status ?? error.statusCode ?? 500;
        res.status(statusCode).json({
          status: statusCode,
          code: error.code,
          message: error.message,
        });
      }
    },
  );

  // ── PATCH /appointments/:id/cancel ────────────────────────────────
  // Cancel an appointment (client-facing)

  router.patch(
    '/appointments/:id/cancel',
    ...cancelValidation,
    async (req: Request, res: Response): Promise<void> => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(422).json({ status: 422, errors: errors.array() });
        return;
      }

      const authReq = req as AuthRequest;
      const userId = authReq.user?.userId ?? authReq.user?._id;
      if (!userId) {
        res.status(401).json({ status: 401, message: 'Authentication required' });
        return;
      }

      try {
        const { id } = req.params;

        // Verify the appointment belongs to the client
        const existing = await AppointmentModel.findOne({ _id: id, userId }).lean();
        if (!existing) {
          res.status(404).json({ status: 404, message: 'Appointment not found' });
          return;
        }

        // Only allow cancelling active appointments
        if (!['scheduled', 'confirmed', 'rescheduled'].includes(existing.status)) {
          res.status(400).json({
            status: 400,
            code: 'INVALID_STATUS',
            message: `Cannot cancel an appointment in "${existing.status}" status`,
          });
          return;
        }

        // Transition to cancelled
        const cancelled = await appointmentService.transitionStatus(id, 'cancelled');

        res.status(200).json({
          status: 200,
          data: {
            appointmentId: String(cancelled._id),
            status: cancelled.status,
            message: 'Appointment cancelled successfully',
          },
        });

        auditLog.log({
          actor: userId,
          actorType: 'client',
          action: 'status_change',
          resource: 'appointment',
          resourceId: id,
          severity: 'warning',
          description: `Client cancelled appointment ${id}`,
        });
      } catch (err) {
        const error = err as Error & { status?: number; statusCode?: number; code?: string };
        const statusCode = error.status ?? error.statusCode ?? 500;
        res.status(statusCode).json({
          status: statusCode,
          code: error.code,
          message: error.message,
        });
      }
    },
  );

  return router;
}
