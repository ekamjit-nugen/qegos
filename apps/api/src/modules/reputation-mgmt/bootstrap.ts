/**
 * Reputation Management — bootstrap.
 *
 * Owns the ReviewModel creation and the reputation router. The daily
 * `sendReviewReminders` cron is registered in server.ts (cron setup lives
 * there for now) and continues to import the function directly from
 * `./review.routes` — bootstrap output intentionally does not re-export it
 * to avoid coupling the cron layout to each module's shape.
 */
import type { Connection, Model } from 'mongoose';
import type { AppContext, BootstrapResult } from '../../bootstrap/context';
import { createReviewModel } from './review.model';
import { createReviewRoutes as createReputationRoutes } from './review.routes';

export interface ReputationMgmtDeps {
  connection: Connection;
  /* eslint-disable @typescript-eslint/no-explicit-any -- Mongoose Model<T> invariance; app passes Model<IFooDocument> */
  OrderModel: Model<any>;
  UserModel: Model<any>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export interface ReputationMgmtResult extends BootstrapResult {
  /** Exposed so other wiring (e.g. seed, analytics) can read reviews. */
  ReviewModel: ReturnType<typeof createReviewModel>;
}

export function bootstrapReputationMgmt(
  ctx: AppContext,
  deps: ReputationMgmtDeps,
): ReputationMgmtResult {
  const ReviewModel = createReviewModel(deps.connection);

  const reputationRouter = createReputationRoutes({
    ReviewModel,
    OrderModel: deps.OrderModel as never,
    UserModel: deps.UserModel as never,
    authenticate: ctx.authenticate,
    checkPermission: ctx.checkPermission,
  });

  return {
    ReviewModel,
    routers: { reputationRouter },
  };
}
