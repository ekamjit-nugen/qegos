import { Router, type Request, type Response, type RequestHandler } from 'express';
import type { Model } from 'mongoose';
import { asyncHandler } from '@nugen/error-handler';
import { validate } from '@nugen/validator';
import * as auditLog from '@nugen/audit-log';
import type { IOrderDocument2, ISalesDocument } from './order.types';
import { createOrderService } from './order.service';
import {
  createOrderValidation,
  updateOrderValidation,
  statusTransitionValidation,
  assignOrderValidation,
  bulkAssignValidation,
  scheduleAppointmentValidation,
  progressValidation,
  listOrderValidation,
  createSalesValidation,
  updateSalesValidation,
} from './order.validators';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    userType: number;
    roleId: string;
  };
  scopeFilter?: Record<string, unknown>;
}

export interface OrderRouteDeps {
  OrderModel: Model<IOrderDocument2>;
  SalesModel: Model<ISalesDocument>;
  authenticate: () => RequestHandler;
  checkPermission: (resource: string, action: string) => RequestHandler;
}

export function createOrderRoutes(deps: OrderRouteDeps): Router {
  const router = Router();
  const { OrderModel, SalesModel, authenticate: auth, checkPermission: check } = deps;
  const service = createOrderService({ OrderModel, SalesModel });

  // ──────────────────────────────────────────────────────────────────────
  // STATS (before :id routes)
  // ──────────────────────────────────────────────────────────────────────

  // 11. GET /orders/stats
  router.get(
    '/stats',
    auth() as never,
    check('orders', 'read') as never,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const stats = await service.getStats();
      res.status(200).json({ status: 200, data: stats });
    }),
  );

  // 12. GET /orders/revenue
  router.get(
    '/revenue',
    auth() as never,
    check('orders', 'read') as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const filters = req.query as { financialYear?: string; dateFrom?: string; dateTo?: string };
      const revenue = await service.getRevenue(filters);
      res.status(200).json({ status: 200, data: revenue });
    }),
  );

  // ──────────────────────────────────────────────────────────────────────
  // ORDER CRUD
  // ──────────────────────────────────────────────────────────────────────

  // 1. POST /orders — Create order
  router.post(
    '/',
    auth() as never,
    check('orders', 'create') as never,
    ...validate(createOrderValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const order = await service.createOrder(
        req.body as Partial<IOrderDocument2>,
        authReq.user.userId,
      );

      void auditLog.log({
        actor: authReq.user.userId,
        actorType: 'staff',
        action: 'create',
        resource: 'order',
        resourceId: order._id.toString(),
        resourceNumber: order.orderNumber,
        severity: 'info',
      });

      res.status(201).json({ status: 201, data: order });
    }),
  );

  // 2. GET /orders — List with filters
  router.get(
    '/',
    auth() as never,
    check('orders', 'read') as never,
    ...validate(listOrderValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const result = await service.listOrders({
        ...req.query as Record<string, string>,
        scopeFilter: authReq.scopeFilter,
      });
      res.status(200).json({
        status: 200,
        data: result.orders,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    }),
  );

  // 3. GET /orders/:id — Full detail
  router.get(
    '/:id',
    auth() as never,
    check('orders', 'read') as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const order = await service.getOrder(req.params.id, authReq.scopeFilter);
      res.status(200).json({ status: 200, data: order });
    }),
  );

  // 4. PUT /orders/:id — Update
  router.put(
    '/:id',
    auth() as never,
    check('orders', 'update') as never,
    ...validate(updateOrderValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const order = await service.updateOrder(
        req.params.id,
        req.body as Partial<IOrderDocument2>,
        authReq.scopeFilter,
      );

      void auditLog.log({
        actor: authReq.user.userId,
        actorType: 'staff',
        action: 'update',
        resource: 'order',
        resourceId: req.params.id,
        severity: 'info',
      });

      res.status(200).json({ status: 200, data: order });
    }),
  );

  // 5. PATCH /orders/:id/status — Status transition
  router.patch(
    '/:id/status',
    auth() as never,
    check('orders', 'update') as never,
    ...validate(statusTransitionValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { status, note, eFileReference, cancelReason } = req.body as {
        status: number;
        note?: string;
        eFileReference?: string;
        cancelReason?: string;
      };

      const order = await service.transitionStatus(
        req.params.id,
        status,
        { note, eFileReference, cancelReason },
        authReq.user.userType,
        authReq.scopeFilter,
      );

      void auditLog.log({
        actor: authReq.user.userId,
        actorType: 'staff',
        action: 'status_change',
        resource: 'order',
        resourceId: req.params.id,
        description: `Status changed to ${status}`,
        severity: status === 9 ? 'critical' : 'info',
      });

      res.status(200).json({ status: 200, data: order });
    }),
  );

  // 6. PUT /orders/:id/assign
  router.put(
    '/:id/assign',
    auth() as never,
    check('orders', 'update') as never,
    ...validate(assignOrderValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { processingBy } = req.body as { processingBy: string };
      const order = await service.assignOrder(req.params.id, processingBy);

      void auditLog.log({
        actor: authReq.user.userId,
        actorType: 'admin',
        action: 'assign',
        resource: 'order',
        resourceId: req.params.id,
        description: `Assigned to ${processingBy}`,
        severity: 'info',
      });

      res.status(200).json({ status: 200, data: order });
    }),
  );

  // 7. PUT /orders/:id/bulk-assign
  router.put(
    '/:id/bulk-assign',
    auth() as never,
    check('orders', 'update') as never,
    ...validate(bulkAssignValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { orderIds, processingBy } = req.body as { orderIds: string[]; processingBy: string };
      const result = await service.bulkAssign(orderIds, processingBy);

      void auditLog.log({
        actor: authReq.user.userId,
        actorType: 'admin',
        action: 'bulk_action',
        resource: 'order',
        resourceId: processingBy,
        description: `Bulk assigned ${orderIds.length} orders`,
        severity: 'info',
      });

      res.status(200).json({ status: 200, data: result });
    }),
  );

  // 8. POST /orders/:id/appointment
  router.post(
    '/:id/appointment',
    auth() as never,
    check('orders', 'update') as never,
    ...validate(scheduleAppointmentValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const data = req.body as {
        date: string;
        timeSlot: string;
        type: string;
        staffId: string;
        meetingLink?: string;
      };
      const order = await service.scheduleAppointment(req.params.id, data);
      res.status(200).json({ status: 200, data: order });
    }),
  );

  // 9. PATCH /orders/:id/progress
  router.patch(
    '/:id/progress',
    auth() as never,
    check('orders', 'update') as never,
    ...validate(progressValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const { percent } = req.body as { percent: number };
      const order = await service.updateProgress(req.params.id, percent, authReq.scopeFilter);
      res.status(200).json({ status: 200, data: order });
    }),
  );

  // 10. POST /orders/:id/calculation
  router.post(
    '/:id/calculation',
    auth() as never,
    check('orders', 'read') as never,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const totals = await service.calculateTotals(req.params.id);
      res.status(200).json({ status: 200, data: totals });
    }),
  );

  return router;
}

// ─── Sales Routes ───────────────────────────────────────────────────────────

export interface SalesRouteDeps {
  SalesModel: Model<ISalesDocument>;
  authenticate: () => RequestHandler;
  checkPermission: (resource: string, action: string) => RequestHandler;
}

export function createSalesRoutes(deps: SalesRouteDeps): Router {
  const router = Router();
  const { SalesModel, authenticate: auth, checkPermission: check } = deps;

  // 13. GET /sales — List active services
  router.get(
    '/',
    auth() as never,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const services = await SalesModel.find({ isActive: true })
        .sort({ sortOrder: 1 })
        .lean();
      res.status(200).json({ status: 200, data: services });
    }),
  );

  // 14. POST /sales — Create service (admin+)
  router.post(
    '/',
    auth() as never,
    check('sales', 'create') as never,
    ...validate(createSalesValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const service = await SalesModel.create(req.body);
      res.status(201).json({ status: 201, data: service });
    }),
  );

  // 15. PUT /sales/:id — Update service (admin+)
  router.put(
    '/:id',
    auth() as never,
    check('sales', 'update') as never,
    ...validate(updateSalesValidation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const service = await SalesModel.findByIdAndUpdate(
        req.params.id,
        req.body as Record<string, unknown>,
        { new: true, runValidators: true },
      );
      if (!service) {
        res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Sales item not found' });
        return;
      }
      res.status(200).json({ status: 200, data: service });
    }),
  );

  return router;
}
