import type { Model, Types } from 'mongoose';
import type { IDataExportDocument, DataExportFormat, ModelFieldConfig } from '../types';

// ─── Module State ───────────────────────────────────────────────────────────

let DataExportModel: Model<IDataExportDocument>;
let modelConfigs: Map<string, ModelFieldConfig>;
let exportExpiryHours: number;

export function initExportService(
  exportModel: Model<IDataExportDocument>,
  configs: Map<string, ModelFieldConfig>,
  expiryHours: number,
): void {
  DataExportModel = exportModel;
  modelConfigs = configs;
  exportExpiryHours = expiryHours;
}

// ─── Create Export Request (APP 12: Right of Access) ───────────────────────

export async function createExportRequest(
  userId: Types.ObjectId,
  requestedBy: Types.ObjectId,
  format: DataExportFormat = 'json',
): Promise<IDataExportDocument> {
  // Check for existing pending/processing request
  const existing = await DataExportModel.findOne({
    userId,
    status: { $in: ['pending', 'processing'] },
  });

  if (existing) {
    const err = new Error('An export request is already in progress') as Error & {
      statusCode: number;
      code: string;
    };
    err.statusCode = 409;
    err.code = 'EXPORT_ALREADY_PENDING';
    throw err;
  }

  return DataExportModel.create({
    userId,
    requestedBy,
    format,
    status: 'pending',
  });
}

// ─── Execute Export ────────────────────────────────────────────────────────

/**
 * Collects all user data across configured models and produces
 * a structured export. Returns the raw data object — caller is
 * responsible for storage (S3, filesystem, etc.).
 */
export async function executeExport(
  requestId: Types.ObjectId,
): Promise<{ exportData: Record<string, unknown[]>; exportDoc: IDataExportDocument }> {
  const request = await DataExportModel.findOneAndUpdate(
    { _id: requestId, status: 'pending' },
    { $set: { status: 'processing' } },
    { new: true },
  );

  if (!request) {
    const err = new Error('Export request not found or not in pending state') as Error & {
      statusCode: number;
      code: string;
    };
    err.statusCode = 404;
    err.code = 'EXPORT_NOT_FOUND';
    throw err;
  }

  const exportData: Record<string, unknown[]> = {};
  const modelsIncluded: string[] = [];
  let totalRecords = 0;

  try {
    for (const [name, config] of modelConfigs) {
      const filter = { [config.userIdField]: request.userId };

      // Build projection: include exportFields or exclude exportExclude
      let projection: Record<string, number> | undefined;
      if (config.exportFields && config.exportFields.length > 0) {
        projection = {};
        for (const f of config.exportFields) {
          projection[f] = 1;
        }
      } else if (config.exportExclude && config.exportExclude.length > 0) {
        projection = {};
        for (const f of config.exportExclude) {
          projection[f] = 0;
        }
      }

      const records = await config.model.find(filter, projection).lean();
      if (records.length > 0) {
        exportData[config.displayName] = records;
        modelsIncluded.push(name);
        totalRecords += records.length;
      }
    }

    // Set expiry
    const expiresAt = new Date(Date.now() + exportExpiryHours * 60 * 60 * 1000);

    const completed = await DataExportModel.findByIdAndUpdate(
      requestId,
      {
        $set: {
          status: 'ready',
          modelsIncluded,
          recordCount: totalRecords,
          expiresAt,
        },
      },
      { new: true },
    );

    return { exportData, exportDoc: completed! };
  } catch (error) {
    await DataExportModel.findByIdAndUpdate(requestId, {
      $set: {
        status: 'failed',
        failureReason: (error as Error).message,
      },
    });
    throw error;
  }
}

// ─── List Exports ──────────────────────────────────────────────────────────

export async function listExports(userId: Types.ObjectId): Promise<IDataExportDocument[]> {
  return DataExportModel.find({ userId }).sort({ createdAt: -1 }).limit(10);
}

// ─── Get Export ────────────────────────────────────────────────────────────

export async function getExport(exportId: Types.ObjectId): Promise<IDataExportDocument | null> {
  return DataExportModel.findById(exportId);
}

// ─── Cleanup Expired Exports ───────────────────────────────────────────────

export async function cleanupExpiredExports(): Promise<number> {
  const result = await DataExportModel.updateMany(
    {
      status: 'ready',
      expiresAt: { $lte: new Date() },
    },
    {
      $set: { status: 'expired' },
      $unset: { fileUrl: 1 },
    },
  );
  return result.modifiedCount;
}
