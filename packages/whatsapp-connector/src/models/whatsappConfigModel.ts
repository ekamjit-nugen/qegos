import { Schema, type Connection, type Model } from 'mongoose';
import type { IWhatsAppConfigDocument, WhatsAppQualityRating } from '../types';

const whatsappConfigSchema = new Schema<IWhatsAppConfigDocument>(
  {
    metaBusinessAccountId: { type: String },
    phoneNumberId: { type: String, required: true },
    accessToken: { type: String, required: true }, // Should be encrypted at rest
    webhookVerifyToken: { type: String, required: true },
    isConnected: { type: Boolean, default: false },
    dailyMessageQuota: { type: Number, default: 1000 },
    qualityRating: {
      type: String,
      enum: ['green', 'yellow', 'red'] as WhatsAppQualityRating[],
      default: 'green',
    },
  },
  {
    timestamps: true,
    collection: 'whatsapp_config',
  },
);

export function createWhatsAppConfigModel(connection: Connection): Model<IWhatsAppConfigDocument> {
  if (connection.models.WhatsAppConfig) {
    return connection.models.WhatsAppConfig as Model<IWhatsAppConfigDocument>;
  }
  return connection.model<IWhatsAppConfigDocument>('WhatsAppConfig', whatsappConfigSchema);
}
