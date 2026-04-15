/**
 * Document Management & Signing — bootstrap.
 *
 * Mounts the main document router + the Zoho webhook router. Zoho OAuth
 * config is sourced from env via the passed-in config object so this
 * module stays decoupled from the app-wide config loader.
 */
import type { Model } from 'mongoose';
import type { AppContext, BootstrapResult } from '../../bootstrap/context';
import { createDocumentRoutes, createZohoWebhookRoute } from './document.routes';

export interface DocumentManagementDeps {
  OrderModel: Model<unknown>;
  UserModel: Model<unknown>;
  zohoSignConfig: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    webhookSecret: string;
    baseUrl: string;
  };
}

export function bootstrapDocumentManagement(
  ctx: AppContext,
  deps: DocumentManagementDeps,
): BootstrapResult {
  const documentRouter = createDocumentRoutes({
    OrderModel: deps.OrderModel as never,
    UserModel: deps.UserModel as never,
    authenticate: ctx.authenticate,
    checkPermission: ctx.checkPermission,
    auditLog: ctx.auditLogDI,
    zohoSignConfig: deps.zohoSignConfig,
  });
  const zohoWebhookRouter = createZohoWebhookRoute({
    OrderModel: deps.OrderModel as never,
    UserModel: deps.UserModel as never,
    authenticate: ctx.authenticate,
    checkPermission: ctx.checkPermission,
    auditLog: ctx.auditLogDI,
    zohoSignConfig: deps.zohoSignConfig,
  });

  return { routers: { documentRouter, zohoWebhookRouter } };
}
