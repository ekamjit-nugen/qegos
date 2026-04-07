import type { Connection, Model } from 'mongoose';
import { createAuditLogModel } from './models/auditLogModel';
import { initAuditService } from './services/auditService';
import type { IAuditLogDocument } from './types';

export interface AuditLogInitResult {
  AuditLogModel: Model<IAuditLogDocument>;
}

/**
 * Initialize the audit-log package.
 */
export function init(connection: Connection): AuditLogInitResult {
  const AuditLogModel = createAuditLogModel(connection);
  initAuditService(AuditLogModel);
  return { AuditLogModel };
}

// Re-export everything
export * from './types';
export { createAuditLogModel } from './models/auditLogModel';
export { log, logFromRequest, initAuditService } from './services/auditService';
export { auditMiddleware } from './middleware/auditMiddleware';
export { createAuditRoutes, type AuditRouteDeps } from './routes/auditRoutes';
