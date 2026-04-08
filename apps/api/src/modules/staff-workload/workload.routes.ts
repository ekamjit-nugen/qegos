import { Router, type Request, type Response } from 'express';
import { param, query, body, validationResult } from 'express-validator';
import type { WorkloadRouteDeps, AssignmentContext } from './workload.types';
import { createWorkloadService, type WorkloadServiceResult } from './workload.service';

function handleValidation(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', errors: errors.array() });
    return true;
  }
  return false;
}

// Module-level ref for external use (e.g., upgraded auto-assignment)
let _service: WorkloadServiceResult | null = null;

export function getWorkloadService(): WorkloadServiceResult | null {
  return _service;
}

/**
 * Create staff workload routes.
 * Mounted under /staff/workload (admin-only).
 */
export function createWorkloadRoutes(deps: WorkloadRouteDeps): Router {
  const service = createWorkloadService(
    {
      UserModel: deps.UserModel,
      LeadModel: deps.LeadModel,
      OrderModel: deps.OrderModel,
      ReviewAssignmentModel: deps.ReviewAssignmentModel,
      SupportTicketModel: deps.SupportTicketModel,
      AppointmentModel: deps.AppointmentModel,
    },
    deps.config,
  );
  _service = service;

  const router = Router();
  const auth = [deps.authenticate(), deps.checkPermission('users', 'read')];
  const authAdmin = [deps.authenticate(), deps.checkPermission('users', 'update')];

  // 1. GET /workload — All staff workloads (admin dashboard)
  router.get(
    '/workload',
    ...auth,
    async (_req: Request, res: Response) => {
      try {
        const workloads = await service.getStaffWorkloads();
        // Sort by workload score descending (busiest first for dashboard)
        workloads.sort((a, b) => b.workloadScore - a.workloadScore);
        res.json({ status: 200, data: workloads });
      } catch (err) {
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
      }
    },
  );

  // 2. GET /workload/:staffId — Single staff workload
  router.get(
    '/workload/:staffId',
    ...auth,
    param('staffId').isMongoId().withMessage('Invalid staff ID'),
    async (req: Request, res: Response) => {
      if (handleValidation(req, res)) return;
      try {
        const workload = await service.getStaffWorkload(req.params.staffId);
        if (!workload) {
          res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Staff member not found or not eligible' });
          return;
        }
        res.json({ status: 200, data: workload });
      } catch (err) {
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
      }
    },
  );

  // 3. POST /workload/suggest — Smart assignment suggestion
  router.post(
    '/workload/suggest',
    ...authAdmin,
    body('context')
      .isIn(['lead', 'order', 'review', 'ticket', 'appointment'])
      .withMessage('context must be one of: lead, order, review, ticket, appointment'),
    body('excludeStaffIds')
      .optional()
      .isArray().withMessage('excludeStaffIds must be an array'),
    body('excludeStaffIds.*')
      .optional()
      .isMongoId().withMessage('Each excludeStaffId must be a valid ObjectId'),
    body('requiredUserTypes')
      .optional()
      .isArray().withMessage('requiredUserTypes must be an array'),
    body('requiredUserTypes.*')
      .optional()
      .isInt({ min: 0, max: 7 }).withMessage('Each userType must be 0-7'),
    body('count')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('count must be 1-100'),
    async (req: Request, res: Response) => {
      if (handleValidation(req, res)) return;
      try {
        const count = req.body.count ? Number(req.body.count) : 1;
        const request = {
          context: req.body.context as AssignmentContext,
          excludeStaffIds: req.body.excludeStaffIds as string[] | undefined,
          requiredUserTypes: req.body.requiredUserTypes as number[] | undefined,
        };

        if (count === 1) {
          const result = await service.smartAssign(request);
          if (!result) {
            res.status(404).json({ status: 404, code: 'NO_ELIGIBLE_STAFF', message: 'No eligible staff available for assignment' });
            return;
          }
          res.json({ status: 200, data: result });
        } else {
          const results = await service.smartAssignBulk(count, request);
          res.json({ status: 200, data: { assignments: results, count: results.length } });
        }
      } catch (err) {
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
      }
    },
  );

  // 4. GET /workload/leaderboard — Staff ranked by efficiency (completed orders / workload)
  router.get(
    '/workload/leaderboard',
    ...auth,
    query('period').optional().isIn(['week', 'month', 'quarter']).withMessage('period must be week, month, or quarter'),
    async (req: Request, res: Response) => {
      if (handleValidation(req, res)) return;
      try {
        const workloads = await service.getStaffWorkloads();
        // Sort by workload score ascending (most available first)
        workloads.sort((a, b) => a.workloadScore - b.workloadScore);
        const leaderboard = workloads.map((w, idx) => ({
          rank: idx + 1,
          ...w,
          utilizationPercent: w.isAtCapacity ? 100 : Math.min(100, Math.round(w.workloadScore * 2)),
        }));
        res.json({ status: 200, data: leaderboard });
      } catch (err) {
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: (err as Error).message });
      }
    },
  );

  return router;
}
