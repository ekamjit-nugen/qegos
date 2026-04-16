import { Schema, type Connection, type Model } from 'mongoose';
import type { IDataExportDocument, DataExportStatus, DataExportFormat } from '../types';
import { DATA_EXPORT_STATUSES } from '../types';

const dataExportSchema = new Schema<IDataExportDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    requestedBy: { type: Schema.Types.ObjectId, required: true },
    status: {
      type: String,
      required: true,
      enum: DATA_EXPORT_STATUSES,
      default: 'pending' as DataExportStatus,
    },
    format: {
      type: String,
      required: true,
      enum: ['json', 'csv'] as DataExportFormat[],
      default: 'json' as DataExportFormat,
    },
    fileUrl: { type: String },
    fileSize: { type: Number },
    modelsIncluded: [{ type: String }],
    recordCount: { type: Number, default: 0 },
    expiresAt: { type: Date },
    failureReason: { type: String },
  },
  {
    timestamps: true,
    collection: 'data_exports',
  },
);

dataExportSchema.index({ status: 1, expiresAt: 1 });

export function createDataExportModel(connection: Connection): Model<IDataExportDocument> {
  if (connection.models.DataExport) {
    return connection.models.DataExport as Model<IDataExportDocument>;
  }
  return connection.model<IDataExportDocument>('DataExport', dataExportSchema);
}
