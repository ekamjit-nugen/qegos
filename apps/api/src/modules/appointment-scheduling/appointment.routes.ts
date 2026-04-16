import { Router } from 'express';
import * as _auditLog from '@nugen/audit-log';
import { getRequestId } from '../../lib/requestContext';
import { validationResult } from 'express-validator';

const auditLog = {
  log: (params: Record<string, unknown>): void => {
    _auditLog.log({ ...params, requestId: getRequestId() } as never).catch(() => {
      // fire-and-forget: audit log failure is non-critical
    });
  },
};
import type { Request, Response } from 'express';
import type { AppointmentRouteDeps, AppointmentStatus } from './appointment.types';
import { createAppointmentService, type AppointmentServiceResult } from './appointment.service';
import {
  createAppointmentValidation,
  updateAppointmentValidation,
  statusTransitionValidation,
  listAppointmentValidation,
  appointmentIdValidation,
  staffAvailabilityValidation,
  availabilityQueryValidation,
} from './appointment.validators';

function handleValidation(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', errors: errors.array() });
    return true;
  }
  return false;
}

// Module-level service ref for BullMQ handlers
let _service: AppointmentServiceResult | null = null;

/**
 * Create appointment routes with dependency injection.
 * Returns two routers: appointmentRouter (/appointments) and staffAvailabilityRouter (/staff).
 */
export function createAppointmentRoutes(deps: AppointmentRouteDeps): {
  appointmentRouter: Router;
  staffAvailabilityRouter: Router;
} {
  const service = createAppointmentService({
    AppointmentModel: deps.AppointmentModel,
    StaffAvailabilityModel: deps.StaffAvailabilityModel,
    OrderModel: deps.OrderModel,
    UserModel: deps.UserModel,
    notificationSend: deps.notificationSend,
    getSetting: deps.getSetting,
  });
  _service = service;

  const appointmentRouter = Router();
  const staffAvailabilityRouter = Router();

  const auth = [deps.authenticate(), deps.checkPermission('calendar', 'read')];
  const authCreate = [deps.authenticate(), deps.checkPermission('calendar', 'create')];
  const authUpdate = [deps.authenticate(), deps.checkPermission('calendar', 'update')];
  const authDelete = [deps.authenticate(), deps.checkPermission('calendar', 'delete')];

  // ─── Appointment Routes ─────────────────────────────────────────────

  // 1. POST / — Create appointment
  appointmentRouter.post(
    '/',
    ...authCreate,
    ...createAppointmentValidation(),
    async (req: Request, res: Response) => {
      if (handleValidation(req, res)) {
        return;
      }
      try {
        const actorId = (req as unknown as { user?: { userId?: string } }).user?.userId ?? '';
        const appointment = await service.createAppointment(
          req.body as Record<string, unknown>,
          actorId,
        );
        res.status(201).json({ status: 201, data: appointment });
        auditLog.log({
          actor: actorId,
          actorType: 'staff',
          action: 'create',
          resource: 'appointment',
          resourceId: (appointment as { _id?: { toString(): string } })._id?.toString() ?? '',
          severity: 'info',
          description: 'Appointment created',
        });
      } catch (err) {
        const error = err as Error & { status?: number; code?: string };
        res.status(error.status ?? 500).json({
          status: error.status ?? 500,
          code: error.code ?? 'INTERNAL_ERROR',
          message: error.message,
        });
      }
    },
  );

  // 2. GET / — List appointments with filters
  appointmentRouter.get(
    '/',
    ...auth,
    ...listAppointmentValidation(),
    async (req: Request, res: Response) => {
      if (handleValidation(req, res)) {
        return;
      }
      try {
        const result = await service.listAppointments({
          dateFrom: req.query.dateFrom as string,
          dateTo: req.query.dateTo as string,
          staffId: req.query.staffId as string,
          userId: req.query.userId as string,
          status: req.query.status as AppointmentStatus | undefined,
          orderId: req.query.orderId as string,
          page: req.query.page ? Number(req.query.page) : undefined,
          limit: req.query.limit ? Number(req.query.limit) : undefined,
        });
        res.json({
          status: 200,
          data: result.appointments,
          meta: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            totalPages: Math.ceil(result.total / result.limit),
          },
        });
      } catch (err) {
        res
          .status(500)
          .json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
      }
    },
  );

  // 3. GET /upcoming — Upcoming for current user (BEFORE /:id)
  appointmentRouter.get('/upcoming', ...auth, async (req: Request, res: Response) => {
    try {
      const userId = (req as unknown as { user?: { userId?: string } }).user?.userId ?? '';
      const appointments = await service.getUpcomingAppointments(userId);
      res.json({ status: 200, data: appointments });
    } catch (err) {
      res
        .status(500)
        .json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
    }
  });

  // 4. GET /calendar — Calendar view aggregated by day
  appointmentRouter.get('/calendar', ...auth, async (req: Request, res: Response) => {
    try {
      const dateFrom = req.query.dateFrom as string;
      const dateTo = req.query.dateTo as string;
      if (!dateFrom || !dateTo) {
        res
          .status(400)
          .json({ status: 400, code: 'VALIDATION_ERROR', message: 'dateFrom and dateTo required' });
        return;
      }
      const staffId = req.query.staffId as string | undefined;
      const calendar = await service.getCalendarView(dateFrom, dateTo, staffId);
      res.json({ status: 200, data: calendar });
    } catch (err) {
      res
        .status(500)
        .json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
    }
  });

  // 5. GET /:id — Get single appointment
  appointmentRouter.get(
    '/:id',
    ...auth,
    ...appointmentIdValidation(),
    async (req: Request, res: Response) => {
      if (handleValidation(req, res)) {
        return;
      }
      try {
        const appointment = await service.getAppointment(req.params.id);
        if (!appointment) {
          res
            .status(404)
            .json({ status: 404, code: 'NOT_FOUND', message: 'Appointment not found' });
          return;
        }
        res.json({ status: 200, data: appointment });
      } catch (err) {
        res
          .status(500)
          .json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
      }
    },
  );

  // 6. PATCH /:id — Update appointment (reschedule, notes, etc.)
  appointmentRouter.patch(
    '/:id',
    ...authUpdate,
    ...updateAppointmentValidation(),
    async (req: Request, res: Response) => {
      if (handleValidation(req, res)) {
        return;
      }
      try {
        const updated = await service.updateAppointment(
          req.params.id,
          req.body as Record<string, unknown>,
        );
        if (!updated) {
          res
            .status(404)
            .json({ status: 404, code: 'NOT_FOUND', message: 'Appointment not found' });
          return;
        }
        res.json({ status: 200, data: updated });
        const actorId = (req as unknown as { user?: { userId?: string } }).user?.userId ?? '';
        auditLog.log({
          actor: actorId,
          actorType: 'staff',
          action: 'update',
          resource: 'appointment',
          resourceId: req.params.id,
          severity: 'warning',
          description: 'Appointment updated',
        });
      } catch (err) {
        const error = err as Error & { status?: number };
        res.status(error.status ?? 500).json({
          status: error.status ?? 500,
          code: 'UPDATE_ERROR',
          message: error.message,
        });
      }
    },
  );

  // 7. PATCH /:id/status — Transition status
  appointmentRouter.patch(
    '/:id/status',
    ...authUpdate,
    ...statusTransitionValidation(),
    async (req: Request, res: Response) => {
      if (handleValidation(req, res)) {
        return;
      }
      try {
        const appointment = await service.transitionStatus(
          req.params.id,
          req.body.status as AppointmentStatus,
        );
        res.json({ status: 200, data: appointment });
        const actorId = (req as unknown as { user?: { userId?: string } }).user?.userId ?? '';
        auditLog.log({
          actor: actorId,
          actorType: 'staff',
          action: 'status_change',
          resource: 'appointment',
          resourceId: req.params.id,
          severity: 'warning',
          description: `Appointment status changed to ${req.body.status as string}`,
        });
      } catch (err) {
        const error = err as Error & { status?: number };
        res.status(error.status ?? 500).json({
          status: error.status ?? 500,
          code: 'STATUS_TRANSITION_ERROR',
          message: error.message,
        });
      }
    },
  );

  // 8. DELETE /:id — Soft delete
  appointmentRouter.delete(
    '/:id',
    ...authDelete,
    ...appointmentIdValidation(),
    async (req: Request, res: Response) => {
      if (handleValidation(req, res)) {
        return;
      }
      try {
        const deleted = await service.softDelete(req.params.id);
        if (!deleted) {
          res
            .status(404)
            .json({ status: 404, code: 'NOT_FOUND', message: 'Appointment not found' });
          return;
        }
        res.json({ status: 200, data: { message: 'Appointment deleted' } });
        const actorId = (req as unknown as { user?: { userId?: string } }).user?.userId ?? '';
        auditLog.log({
          actor: actorId,
          actorType: 'staff',
          action: 'delete',
          resource: 'appointment',
          resourceId: req.params.id,
          severity: 'critical',
          description: 'Appointment soft deleted',
        });
      } catch (err) {
        res
          .status(500)
          .json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
      }
    },
  );

  // ─── Staff Availability Routes ──────────────────────────────────────

  // 9. GET /:staffId/availability — Available slots
  staffAvailabilityRouter.get(
    '/:staffId/availability',
    ...auth,
    ...availabilityQueryValidation(),
    async (req: Request, res: Response) => {
      if (handleValidation(req, res)) {
        return;
      }
      try {
        const slots = await service.getStaffAvailability(
          req.params.staffId,
          req.query.dateFrom as string,
          req.query.dateTo as string,
        );
        res.json({ status: 200, data: slots });
      } catch (err) {
        res
          .status(500)
          .json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
      }
    },
  );

  // 10. POST /:staffId/availability — Set working hours / block
  staffAvailabilityRouter.post(
    '/:staffId/availability',
    ...authCreate,
    ...staffAvailabilityValidation(),
    async (req: Request, res: Response) => {
      if (handleValidation(req, res)) {
        return;
      }
      try {
        const availability = await service.setStaffAvailability(
          req.params.staffId,
          req.body as Record<string, unknown>,
        );
        res.status(201).json({ status: 201, data: availability });
        const actorId = (req as unknown as { user?: { userId?: string } }).user?.userId ?? '';
        auditLog.log({
          actor: actorId,
          actorType: 'staff',
          action: 'create',
          resource: 'staff_availability',
          resourceId: req.params.staffId,
          severity: 'info',
          description: 'Staff availability set',
        });
      } catch (err) {
        res
          .status(500)
          .json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
      }
    },
  );

  return { appointmentRouter, staffAvailabilityRouter };
}

/**
 * BullMQ handler: process appointment reminders (APT-INV-02).
 * Exported for use in server.ts worker.
 */
export async function processAppointmentReminders(): Promise<number> {
  if (!_service) {
    return 0;
  }
  return _service.processReminders();
}

/**
 * BullMQ handler: mark no-shows (APT-INV-03).
 * Exported for use in server.ts worker.
 */
export async function markNoShows(): Promise<number> {
  if (!_service) {
    return 0;
  }
  return _service.markNoShows();
}
