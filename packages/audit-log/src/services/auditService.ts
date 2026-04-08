import type { Model } from 'mongoose';
import type { Request } from 'express';
import type { IAuditLogDocument, AuditEntry, AuditActorType } from '../types';

let _AuditLogModel: Model<IAuditLogDocument> | null = null;

export function initAuditService(AuditLogModel: Model<IAuditLogDocument>): void {
  _AuditLogModel = AuditLogModel;
}

function getModel(): Model<IAuditLogDocument> {
  if (!_AuditLogModel) {
    throw new Error('Audit service not initialized. Call initAuditService first.');
  }
  return _AuditLogModel;
}

// Map userType number to actor type string
const USER_TYPE_MAP: Record<number, AuditActorType> = {
  0: 'super_admin',
  1: 'admin',
  2: 'client',
  3: 'staff',
  4: 'student',
  5: 'office_manager',
  6: 'senior_staff',
};

/**
 * Log an audit entry directly.
 */
export async function log(entry: AuditEntry): Promise<IAuditLogDocument> {
  const AuditLog = getModel();
  return AuditLog.create({
    ...entry,
    timestamp: new Date(),
  });
}

/**
 * Log an audit entry from an Express request, extracting actor and metadata.
 */
export async function logFromRequest(
  req: Request,
  entry: Omit<AuditEntry, 'actor' | 'actorType' | 'metadata'> & {
    actor?: string;
    actorType?: AuditActorType;
  },
): Promise<IAuditLogDocument> {
  const user = (req as unknown as Record<string, unknown>).user as {
    userId: string;
    userType: number;
  } | undefined;

  const actor = entry.actor ?? user?.userId ?? 'system';
  const actorType = entry.actorType ?? (user ? USER_TYPE_MAP[user.userType] || 'staff' : 'system');

  return log({
    ...entry,
    actor,
    actorType,
    metadata: {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestMethod: req.method,
      requestPath: req.originalUrl,
    },
  });
}
