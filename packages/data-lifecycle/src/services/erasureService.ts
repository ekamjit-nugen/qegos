import type { Model, Types } from 'mongoose';
import type {
  IErasureRequestDocument,
  ModelFieldConfig,
} from '../types';

// ─── Module State ───────────────────────────────────────────────────────────

let ErasureRequestModel: Model<IErasureRequestDocument>;
let modelConfigs: Map<string, ModelFieldConfig>;

export function initErasureService(
  erasureModel: Model<IErasureRequestDocument>,
  configs: Map<string, ModelFieldConfig>,
): void {
  ErasureRequestModel = erasureModel;
  modelConfigs = configs;
}

// ─── Create Erasure Request (APP 11) ───────────────────────────────────────

export async function createErasureRequest(
  userId: Types.ObjectId,
  requestedBy: Types.ObjectId,
  reason?: string,
): Promise<IErasureRequestDocument> {
  // Check for existing pending/in-progress request
  const existing = await ErasureRequestModel.findOne({
    userId,
    status: { $in: ['pending', 'approved', 'in_progress'] },
  });

  if (existing) {
    const err = new Error('An erasure request is already in progress for this user') as Error & {
      statusCode: number; code: string;
    };
    err.statusCode = 409;
    err.code = 'ERASURE_ALREADY_PENDING';
    throw err;
  }

  return ErasureRequestModel.create({
    userId,
    requestedBy,
    reason,
    status: 'pending',
  });
}

// ─── List Erasure Requests ─────────────────────────────────────────────────

export async function listErasureRequests(
  filters: { status?: string; page?: number; limit?: number },
): Promise<{ requests: IErasureRequestDocument[]; total: number }> {
  const { status, page = 1, limit = 20 } = filters;
  const query: Record<string, unknown> = {};
  if (status) query.status = status;

  const [requests, total] = await Promise.all([
    ErasureRequestModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    ErasureRequestModel.countDocuments(query),
  ]);

  return { requests, total };
}

// ─── Approve Erasure Request ───────────────────────────────────────────────

export async function approveErasureRequest(
  requestId: Types.ObjectId,
  approvedBy: Types.ObjectId,
): Promise<IErasureRequestDocument | null> {
  return ErasureRequestModel.findOneAndUpdate(
    { _id: requestId, status: 'pending' },
    {
      $set: {
        status: 'approved',
        approvedBy,
        approvedAt: new Date(),
      },
    },
    { new: true },
  );
}

// ─── Reject Erasure Request ────────────────────────────────────────────────

export async function rejectErasureRequest(
  requestId: Types.ObjectId,
  rejectionReason: string,
): Promise<IErasureRequestDocument | null> {
  return ErasureRequestModel.findOneAndUpdate(
    { _id: requestId, status: 'pending' },
    {
      $set: {
        status: 'rejected',
        rejectionReason,
      },
    },
    { new: true },
  );
}

// ─── Execute Erasure (APP 11: Data Destruction) ────────────────────────────

/**
 * Anonymizes PII across all configured models for a given user.
 * - PII fields → replaced with configured replacement values
 * - Models with hardDelete=true → records removed entirely
 * - Tracks progress in erasure request document
 */
export async function executeErasure(
  requestId: Types.ObjectId,
): Promise<IErasureRequestDocument> {
  const request = await ErasureRequestModel.findOneAndUpdate(
    { _id: requestId, status: 'approved' },
    { $set: { status: 'in_progress' } },
    { new: true },
  );

  if (!request) {
    const err = new Error('Erasure request not found or not in approved state') as Error & {
      statusCode: number; code: string;
    };
    err.statusCode = 404;
    err.code = 'ERASURE_NOT_FOUND';
    throw err;
  }

  const processed: string[] = [];
  let totalAnonymized = 0;
  let totalDeleted = 0;

  try {
    for (const [name, config] of modelConfigs) {
      const filter = { [config.userIdField]: request.userId };

      if (config.hardDelete) {
        // Hard delete all records
        const result = await config.model.deleteMany(filter);
        totalDeleted += result.deletedCount;
      } else {
        // Anonymize PII fields
        const setFields: Record<string, string> = {};
        for (const [field, replacement] of Object.entries(config.piiFields)) {
          setFields[field] = replacement;
        }

        if (Object.keys(setFields).length > 0) {
          const result = await config.model.updateMany(filter, { $set: setFields });
          totalAnonymized += result.modifiedCount;
        }
      }

      processed.push(name);
    }

    // Mark as completed
    const completed = await ErasureRequestModel.findByIdAndUpdate(
      requestId,
      {
        $set: {
          status: 'completed',
          executedAt: new Date(),
          modelsProcessed: processed,
          recordsAnonymized: totalAnonymized,
          recordsDeleted: totalDeleted,
        },
      },
      { new: true },
    );

    return completed!;
  } catch (error) {
    // Mark as failed with reason
    await ErasureRequestModel.findByIdAndUpdate(requestId, {
      $set: {
        status: 'failed',
        modelsProcessed: processed,
        recordsAnonymized: totalAnonymized,
        recordsDeleted: totalDeleted,
        failureReason: (error as Error).message,
      },
    });

    throw error;
  }
}

// ─── Get Erasure Request ───────────────────────────────────────────────────

export async function getErasureRequest(
  requestId: Types.ObjectId,
): Promise<IErasureRequestDocument | null> {
  return ErasureRequestModel.findById(requestId);
}
