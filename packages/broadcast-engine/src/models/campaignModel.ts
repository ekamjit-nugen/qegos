import { Schema, type Connection, type Model } from 'mongoose';
import type { IBroadcastCampaignDocument } from '../types';

let campaignCounter = 0;

function generateCampaignId(): string {
  campaignCounter += 1;
  return `QGS-BC-${String(campaignCounter).padStart(4, '0')}`;
}

const audienceFiltersSchema = new Schema(
  {
    leadStatus: { type: [String], default: undefined },
    priority: { type: [String], default: undefined },
    source: { type: [String], default: undefined },
    state: { type: [String], default: undefined },
    tags: { type: [String], default: undefined },
    userType: { type: [String], default: undefined },
    financialYear: { type: String },
    hasConsent: { type: Boolean },
  },
  { _id: false },
);

const customRecipientSchema = new Schema(
  {
    mobile: { type: String },
    email: { type: String },
    firstName: { type: String },
    lastName: { type: String },
  },
  { _id: false },
);

const abVariantSchema = new Schema(
  {
    name: { type: String, required: true },
    subject: { type: String },
    body: { type: String, required: true },
    percentage: { type: Number, required: true },
  },
  { _id: false },
);

const abTestSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    variants: { type: [abVariantSchema], default: [] },
    winnerMetric: { type: String, enum: ['open_rate', 'click_rate'], default: 'open_rate' },
    winnerSelectedAt: { type: Date },
  },
  { _id: false },
);

const broadcastCampaignSchema = new Schema<IBroadcastCampaignDocument>(
  {
    campaignId: {
      type: String,
      unique: true,
      default: generateCampaignId,
    },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    channel: {
      type: String,
      required: true,
      enum: ['sms', 'email', 'whatsapp', 'sms_email', 'all'],
    },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'scheduled', 'sending', 'paused', 'sent', 'failed', 'cancelled'],
      default: 'draft',
    },
    audienceType: {
      type: String,
      required: true,
      enum: ['all_leads', 'filtered_leads', 'all_users', 'filtered_users', 'custom_list'],
    },
    audienceFilters: { type: audienceFiltersSchema },
    customList: { type: [customRecipientSchema], default: undefined },
    smsTemplateId: { type: Schema.Types.ObjectId, ref: 'BroadcastTemplate' },
    emailTemplateId: { type: Schema.Types.ObjectId, ref: 'BroadcastTemplate' },
    whatsappTemplateId: { type: Schema.Types.ObjectId, ref: 'BroadcastTemplate' },
    smsBody: { type: String },
    emailSubject: { type: String },
    emailBody: { type: String },
    whatsappTemplateName: { type: String },
    whatsappTemplateParams: { type: [String], default: undefined },
    scheduledAt: { type: Date },
    totalRecipients: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    openCount: { type: Number, default: 0 },
    clickCount: { type: Number, default: 0 },
    optOutCount: { type: Number, default: 0 },
    abTest: { type: abTestSchema },
    costEstimate: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    collection: 'broadcast_campaigns',
  },
);

// Indexes
broadcastCampaignSchema.index({ status: 1, scheduledAt: 1 });
broadcastCampaignSchema.index({ createdBy: 1, createdAt: -1 });
broadcastCampaignSchema.index({ campaignId: 1 }, { unique: true });
broadcastCampaignSchema.index({ channel: 1, status: 1 }); // list campaigns filter

export function createCampaignModel(connection: Connection): Model<IBroadcastCampaignDocument> {
  if (connection.models.BroadcastCampaign) {
    return connection.models.BroadcastCampaign as Model<IBroadcastCampaignDocument>;
  }
  return connection.model<IBroadcastCampaignDocument>('BroadcastCampaign', broadcastCampaignSchema);
}
