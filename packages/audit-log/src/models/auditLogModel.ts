import { Schema, type Model, type Connection } from 'mongoose';
import type { IAuditLogDocument } from '../types';

const auditLogSchema = new Schema<IAuditLogDocument>(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorType: {
      type: String,
      required: true,
      enum: [
        'super_admin',
        'admin',
        'office_manager',
        'senior_staff',
        'staff',
        'client',
        'student',
        'system',
        'cron',
      ],
    },
    action: {
      type: String,
      required: true,
      enum: [
        'create',
        'read',
        'update',
        'delete',
        'status_change',
        'assign',
        'reassign',
        'login',
        'login_failed',
        'logout',
        'export',
        'bulk_action',
        'convert',
        'merge',
        'refund',
        'void',
        'payment_capture',
        'config_change',
      ],
    },
    resource: { type: String, required: true },
    resourceId: { type: Schema.Types.ObjectId, required: true },
    resourceNumber: { type: String },
    changes: { type: Schema.Types.Mixed },
    description: { type: String },
    metadata: {
      type: {
        ipAddress: String,
        userAgent: String,
        requestMethod: String,
        requestPath: String,
        sessionId: String,
        geoLocation: String,
      },
    },
    severity: {
      type: String,
      required: true,
      enum: ['info', 'warning', 'critical'],
    },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: false, // We use our own timestamp field
  },
);

// Indexes per PRD Section 2.4
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ actor: 1, timestamp: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1 });
auditLogSchema.index({ severity: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

// FIX for Vegeta S-6: Text index for search instead of $regex (prevents ReDoS)
auditLogSchema.index({ description: 'text', resourceNumber: 'text' });

// RBAC-INV-07: Append-only enforcement — block updates and deletes
auditLogSchema.pre('updateOne', function (next) {
  const options = this.getOptions() as { __archival?: boolean };
  if (options.__archival) {
    return next(); // Allow archival operations
  }
  next(new Error('Audit logs cannot be modified. Append-only collection.'));
});

auditLogSchema.pre('updateMany', function (next) {
  next(new Error('Audit logs cannot be modified. Append-only collection.'));
});

auditLogSchema.pre('findOneAndUpdate', function (next) {
  next(new Error('Audit logs cannot be modified. Append-only collection.'));
});

auditLogSchema.pre('findOneAndDelete', function (next) {
  next(new Error('Audit logs cannot be deleted via application code.'));
});

auditLogSchema.pre('deleteOne', function (next) {
  const options = this.getOptions() as { __archival?: boolean };
  if (options.__archival) {
    return next();
  }
  next(new Error('Audit logs cannot be deleted. Append-only collection.'));
});

auditLogSchema.pre('deleteMany', function (next) {
  const options = this.getOptions() as { __archival?: boolean };
  if (options.__archival) {
    return next();
  }
  next(new Error('Audit logs cannot be deleted. Append-only collection.'));
});

/**
 * Factory function to create the AuditLog model.
 */
export function createAuditLogModel(connection: Connection): Model<IAuditLogDocument> {
  return connection.model<IAuditLogDocument>('AuditLog', auditLogSchema);
}
