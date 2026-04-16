import { Router, type Request, type Response, type NextFunction } from 'express';
import { validationResult } from 'express-validator';
import mongoose, { type Types } from 'mongoose';
import type { SupportTicketsRouteDeps } from '../types';
import {
  createTicketValidation,
  listTicketsValidation,
  getTicketValidation,
  updateStatusValidation,
  assignTicketValidation,
  addMessageValidation,
  escalateValidation,
  resolveValidation,
  reopenValidation,
  satisfactionValidation,
} from '../validators/ticketValidators';
import {
  initTicketService,
  createTicket,
  getTicket,
  listTickets,
  updateTicketStatus,
  assignTicket,
  addMessage,
  escalateTicket,
  resolveTicket,
  reopenTicket,
  rateSatisfaction,
  getTicketStats,
} from '../services/ticketService';
import { initSlaEngine } from '../services/slaEngine';
import { setCounterModel } from '../models/ticketModel';

interface AuthRequest extends Request {
  user?: { userId: string; userType: number; roleId: string };
}

function handleValidation(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', errors: errors.array() });
    return false;
  }
  return true;
}

export function createTicketRoutes(deps: SupportTicketsRouteDeps): Router {
  const router = Router();

  // Initialize
  initTicketService(deps.TicketModel);
  initSlaEngine(deps.config);
  setCounterModel(deps.CounterModel as never);

  // deps.authenticate may be a factory (() => RequestHandler) or a direct RequestHandler
  const authMiddleware =
    typeof deps.authenticate === 'function' && deps.authenticate.length === 0
      ? (deps.authenticate as unknown as () => import('express').RequestHandler)()
      : deps.authenticate;
  router.use(authMiddleware);

  // ── POST /tickets ─────────────────────────────────────────────────────

  router.post(
    '/',
    ...createTicketValidation,
    async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }
      const user = (req as AuthRequest).user!;

      const ticket = await createTicket({
        userId: user.userId,
        ...req.body,
      });

      // TKT-INV-07: Audit log
      await deps.auditLog.log({
        actor: user.userId,
        action: 'ticket.created',
        resource: 'SupportTicket',
        resourceId: ticket._id,
        severity: 'info',
        metadata: {
          ticketNumber: ticket.ticketNumber,
          category: ticket.category,
          priority: ticket.priority,
        },
      });

      res.status(201).json({ status: 201, data: { ticket } });
    },
  );

  // ── GET /tickets ──────────────────────────────────────────────────────

  router.get('/', ...listTicketsValidation, async (req: Request, res: Response): Promise<void> => {
    if (!handleValidation(req, res)) {
      return;
    }
    const user = (req as AuthRequest).user!;
    const q = req.query as Record<string, string>;

    const params: Record<string, unknown> = {};
    if (q.status) {
      params.status = q.status;
    }
    if (q.category) {
      params.category = q.category;
    }
    if (q.priority) {
      params.priority = q.priority;
    }
    if (q.assignedTo) {
      params.assignedTo = q.assignedTo;
    }
    if (q.slaBreached !== undefined) {
      params.slaBreached = q.slaBreached === 'true';
    }
    if (q.page) {
      params.page = parseInt(q.page, 10);
    }
    if (q.limit) {
      params.limit = parseInt(q.limit, 10);
    }

    // Clients only see own tickets; clients must not see internal notes
    if (user.userType >= 5) {
      params.userId = user.userId;
      params.filterInternal = true;
    }

    const result = await listTickets(params as never);
    res.status(200).json({ status: 200, data: result });
  });

  // ── GET /tickets/:id ──────────────────────────────────────────────────

  router.get('/:id', ...getTicketValidation, async (req: Request, res: Response): Promise<void> => {
    if (!handleValidation(req, res)) {
      return;
    }
    const user = (req as AuthRequest).user!;

    // TKT-INV-03: Filter internal messages for clients
    const filterInternal = user.userType >= 5;
    const ticket = await getTicket(req.params.id as unknown as Types.ObjectId, { filterInternal });

    if (!ticket) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND' });
      return;
    }

    res.status(200).json({ status: 200, data: { ticket } });
  });

  // ── PATCH /tickets/:id/status ─────────────────────────────────────────

  router.patch(
    '/:id/status',
    deps.checkPermission('tickets', 'manage') as import('express').RequestHandler,
    ...updateStatusValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }
      const user = (req as AuthRequest).user!;

      try {
        const ticket = await updateTicketStatus(
          req.params.id as unknown as Types.ObjectId,
          req.body.status,
        );

        if (!ticket) {
          res.status(404).json({ status: 404, code: 'NOT_FOUND' });
          return;
        }

        // TKT-INV-07: Audit log on every status change
        await deps.auditLog.log({
          actor: user.userId,
          action: 'ticket.status_changed',
          resource: 'SupportTicket',
          resourceId: ticket._id,
          severity: 'info',
          metadata: { newStatus: req.body.status, ticketNumber: ticket.ticketNumber },
        });

        res.status(200).json({ status: 200, data: { ticket } });
      } catch (err) {
        const error = err as Error & { statusCode?: number; code?: string };
        res.status(error.statusCode ?? 500).json({
          status: error.statusCode ?? 500,
          code: error.code,
          message: error.message,
        });
      }
    },
  );

  // ── PUT /tickets/:id/assign ───────────────────────────────────────────

  router.put(
    '/:id/assign',
    deps.checkPermission('tickets', 'manage') as import('express').RequestHandler,
    ...assignTicketValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }
      const user = (req as AuthRequest).user!;

      try {
        const ticket = await assignTicket(
          req.params.id as unknown as Types.ObjectId,
          req.body.staffId as unknown as Types.ObjectId,
        );

        if (!ticket) {
          res.status(404).json({ status: 404, code: 'NOT_FOUND' });
          return;
        }

        await deps.auditLog.log({
          actor: user.userId,
          action: 'ticket.assigned',
          resource: 'SupportTicket',
          resourceId: ticket._id,
          severity: 'info',
          metadata: { assignedTo: req.body.staffId, ticketNumber: ticket.ticketNumber },
        });

        res.status(200).json({ status: 200, data: { ticket } });
      } catch (err) {
        const error = err as Error & { statusCode?: number; code?: string };
        res.status(error.statusCode ?? 500).json({
          status: error.statusCode ?? 500,
          code: error.code,
          message: error.message,
        });
      }
    },
  );

  // ── POST /tickets/:id/message ─────────────────────────────────────────

  router.post(
    '/:id/message',
    ...addMessageValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }
      const user = (req as AuthRequest).user!;

      const ticket = await addMessage(req.params.id as unknown as Types.ObjectId, {
        senderId: new mongoose.Types.ObjectId(user.userId),
        senderType: user.userType >= 5 ? 'client' : 'staff',
        content: req.body.content,
        attachments: req.body.attachments,
        isInternal: user.userType < 5 ? req.body.isInternal : false,
      });

      if (!ticket) {
        res.status(404).json({ status: 404, code: 'NOT_FOUND' });
        return;
      }

      res.status(200).json({ status: 200, data: { ticket } });
    },
  );

  // ── POST /tickets/:id/escalate ────────────────────────────────────────

  router.post(
    '/:id/escalate',
    deps.checkPermission('tickets', 'manage') as import('express').RequestHandler,
    ...escalateValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }
      const user = (req as AuthRequest).user!;

      const ticket = await escalateTicket(
        req.params.id as unknown as Types.ObjectId,
        req.body.escalatedTo as unknown as Types.ObjectId,
        req.body.reason,
      );

      if (!ticket) {
        res.status(404).json({ status: 404, code: 'NOT_FOUND' });
        return;
      }

      // TKT-INV-07: Escalation = severity warning
      await deps.auditLog.log({
        actor: user.userId,
        action: 'ticket.escalated',
        resource: 'SupportTicket',
        resourceId: ticket._id,
        severity: 'warning',
        metadata: { escalatedTo: req.body.escalatedTo, reason: req.body.reason },
      });

      res.status(200).json({ status: 200, data: { ticket } });
    },
  );

  // ── PATCH /tickets/:id/resolve ────────────────────────────────────────

  router.patch(
    '/:id/resolve',
    deps.checkPermission('tickets', 'manage') as import('express').RequestHandler,
    ...resolveValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }
      const user = (req as AuthRequest).user!;

      try {
        const ticket = await resolveTicket(
          req.params.id as unknown as Types.ObjectId,
          req.body.resolution,
          req.body.resolutionCategory,
        );

        if (!ticket) {
          res.status(404).json({ status: 404, code: 'NOT_FOUND' });
          return;
        }

        await deps.auditLog.log({
          actor: user.userId,
          action: 'ticket.resolved',
          resource: 'SupportTicket',
          resourceId: ticket._id,
          severity: 'info',
          metadata: {
            resolution: req.body.resolution,
            resolutionCategory: req.body.resolutionCategory,
          },
        });

        res.status(200).json({ status: 200, data: { ticket } });
      } catch (err) {
        const error = err as Error & { statusCode?: number; code?: string };
        res.status(error.statusCode ?? 500).json({
          status: error.statusCode ?? 500,
          code: error.code,
          message: error.message,
        });
      }
    },
  );

  // ── POST /tickets/:id/reopen (TKT-INV-06: max 3) ────────────────────

  router.post(
    '/:id/reopen',
    ...reopenValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }

      try {
        const ticket = await reopenTicket(req.params.id as unknown as Types.ObjectId);

        if (!ticket) {
          res.status(404).json({ status: 404, code: 'NOT_FOUND' });
          return;
        }

        res.status(200).json({ status: 200, data: { ticket } });
      } catch (err) {
        const error = err as Error & { statusCode?: number; code?: string };
        res.status(error.statusCode ?? 500).json({
          status: error.statusCode ?? 500,
          code: error.code,
          message: error.message,
        });
      }
    },
  );

  // ── POST /tickets/:id/satisfaction ────────────────────────────────────

  router.post(
    '/:id/satisfaction',
    ...satisfactionValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) {
        return;
      }

      const ticket = await rateSatisfaction(
        req.params.id as unknown as Types.ObjectId,
        req.body.rating,
      );

      if (!ticket) {
        res.status(404).json({ status: 404, code: 'NOT_FOUND' });
        return;
      }

      res.status(200).json({ status: 200, data: { ticket } });
    },
  );

  // ── GET /tickets/stats ────────────────────────────────────────────────

  router.get(
    '/stats',
    deps.checkPermission('tickets', 'admin') as import('express').RequestHandler,
    async (_req: Request, res: Response): Promise<void> => {
      const stats = await getTicketStats();
      res.status(200).json({ status: 200, data: stats });
    },
  );

  return router;
}
