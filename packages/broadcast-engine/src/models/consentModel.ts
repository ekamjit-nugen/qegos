import { Schema, type Connection, type Model } from 'mongoose';
import type { IConsentRecordDocument } from '../types';

const consentRecordSchema = new Schema<IConsentRecordDocument>(
  {
    contactId: { type: Schema.Types.ObjectId, required: true },
    contactType: {
      type: String,
      required: true,
      enum: ['user', 'lead'],
    },
    channel: {
      type: String,
      required: true,
      enum: ['sms', 'email', 'whatsapp', 'push'],
    },
    consented: { type: Boolean, required: true },
    consentSource: {
      type: String,
      required: true,
      enum: ['signup', 'import', 'referral', 'web_form', 'verbal', 'admin_manual'],
    },
    consentDate: { type: Date, required: true },
    consentEvidence: { type: String, maxlength: 500 },
    withdrawnAt: { type: Date },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'broadcast_consent_records',
  },
);

// Unique compound: one consent record per contact per channel
consentRecordSchema.index({ contactId: 1, contactType: 1, channel: 1 }, { unique: true });
consentRecordSchema.index({ consented: 1, channel: 1 });

export function createConsentModel(connection: Connection): Model<IConsentRecordDocument> {
  if (connection.models.BroadcastConsent) {
    return connection.models.BroadcastConsent as Model<IConsentRecordDocument>;
  }
  return connection.model<IConsentRecordDocument>('BroadcastConsent', consentRecordSchema);
}
