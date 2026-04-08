import { Schema, type Connection, type Model } from 'mongoose';
import type { IXeroConfigDocument } from '../types';

const xeroConfigSchema = new Schema<IXeroConfigDocument>(
  {
    xeroConnected: { type: Boolean, default: false },
    xeroTenantId: { type: String },
    // XRO-INV-01: Encrypted tokens — select:false prevents accidental exposure
    xeroAccessToken: { type: String, select: false },
    xeroRefreshToken: { type: String, select: false },
    xeroTokenExpiresAt: { type: Date },
    xeroRevenueAccountCode: { type: String },
    xeroBankAccountId: { type: String },
    xeroGstAccountCode: { type: String },
    xeroDefaultTaxType: { type: String, default: 'OUTPUT' },
    lastSyncAt: { type: Date },
    syncErrorCount: { type: Number, default: 0 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    collection: 'xero_config',
  },
);

export function createXeroConfigModel(connection: Connection): Model<IXeroConfigDocument> {
  if (connection.models.XeroConfig) {
    return connection.models.XeroConfig as Model<IXeroConfigDocument>;
  }
  return connection.model<IXeroConfigDocument>('XeroConfig', xeroConfigSchema);
}
