/**
 * Staff Workload Balancing — bootstrap.
 *
 * Extracted from server.ts. Preserves the module-level `_service` singleton
 * side-effect in `workload.routes.ts` — `getWorkloadService()` continues to
 * work for lead-management's automation handlers after bootstrap runs.
 */
import type { Model } from 'mongoose';
import type { AppContext, BootstrapResult } from '../../bootstrap/context';
import { createWorkloadRoutes } from './workload.routes';

export interface StaffWorkloadDeps {
  UserModel: Model<any>;
  LeadModel: Model<any>;
  OrderModel: Model<any>;
  ReviewAssignmentModel: Model<any>;
  SupportTicketModel: Model<any>;
  AppointmentModel: Model<any>;
}

export function bootstrapStaffWorkload(ctx: AppContext, deps: StaffWorkloadDeps): BootstrapResult {
  const workloadRouter = createWorkloadRoutes({
    UserModel: deps.UserModel as never,
    LeadModel: deps.LeadModel as never,
    OrderModel: deps.OrderModel as never,
    ReviewAssignmentModel: deps.ReviewAssignmentModel as never,
    SupportTicketModel: deps.SupportTicketModel as never,
    AppointmentModel: deps.AppointmentModel as never,
    authenticate: ctx.authenticate,
    checkPermission: ctx.checkPermission,
  });

  return { routers: { workloadRouter } };
}
