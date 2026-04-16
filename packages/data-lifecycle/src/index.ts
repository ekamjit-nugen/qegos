import type { Connection, Model } from 'mongoose';
import type {
  IErasureRequestDocument,
  IDataExportDocument,
  DataLifecycleConfig,
  ModelFieldConfig,
} from './types';
import { createErasureRequestModel } from './models/erasureRequestModel';
import { createDataExportModel } from './models/dataExportModel';
import { initErasureService } from './services/erasureService';
import { initExportService } from './services/exportService';
import { initRetentionService } from './services/retentionService';

// ─── Re-exports ────────────────────────────────────────────────────────────

export * from './types';
export { createErasureRequestModel } from './models/erasureRequestModel';
export { createDataExportModel } from './models/dataExportModel';
export {
  createErasureRequest,
  listErasureRequests,
  approveErasureRequest,
  rejectErasureRequest,
  executeErasure,
  getErasureRequest,
} from './services/erasureService';
export {
  createExportRequest,
  executeExport,
  listExports,
  getExport,
  cleanupExpiredExports,
} from './services/exportService';
export { enforceRetentionPolicies } from './services/retentionService';
export * from './validators/dataLifecycleValidators';

// ─── Package Initialization ────────────────────────────────────────────────

export interface DataLifecycleInitResult {
  ErasureRequestModel: Model<IErasureRequestDocument>;
  DataExportModel: Model<IDataExportDocument>;
}

export function init(
  connection: Connection,
  config: DataLifecycleConfig,
  modelConfigs: Map<string, ModelFieldConfig>,
): DataLifecycleInitResult {
  const ErasureRequestModel = createErasureRequestModel(connection);
  const DataExportModel = createDataExportModel(connection);

  initErasureService(ErasureRequestModel, modelConfigs);
  initExportService(DataExportModel, modelConfigs, config.exportExpiryHours ?? 48);
  initRetentionService(config.retentionPolicies ?? [], modelConfigs);

  return { ErasureRequestModel, DataExportModel };
}
