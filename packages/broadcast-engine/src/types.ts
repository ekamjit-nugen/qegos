import type { Document, Types, Model } from 'mongoose';
import type { RequestHandler } from 'express';

// ─── Channel & Status Enums ──────────────────────────────────────────────────

export type BroadcastChannel = 'sms' | 'email' | 'whatsapp' | 'sms_email' | 'all';

export type SingleChannel = 'sms' | 'email' | 'whatsapp';

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'paused'
  | 'sent'
  | 'failed'
  | 'cancelled';

export type MessageStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'bounced'
  | 'opened'
  | 'clicked'
  | 'opted_out';

export type AudienceType =
  | 'all_leads'
  | 'filtered_leads'
  | 'all_users'
  | 'filtered_users'
  | 'custom_list';

export type TemplateCategory =
  | 'follow_up'
  | 'promotion'
  | 'reminder'
  | 'announcement'
  | 'welcome'
  | 're_engagement'
  | 'deadline'
  | 'review_request';

export type OptOutReason =
  | 'user_request'
  | 'reply_stop'
  | 'bounce_hard'
  | 'bounce_soft_3x'
  | 'admin_manual'
  | 'spam_complaint';

export type ConsentSource =
  | 'signup'
  | 'import'
  | 'referral'
  | 'web_form'
  | 'verbal'
  | 'admin_manual';

// ─── Campaign Status Machine ─────────────────────────────────────────────────

export const CAMPAIGN_STATUS_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ['scheduled', 'sending', 'cancelled'],
  scheduled: ['sending', 'cancelled'],
  sending: ['paused', 'sent', 'failed'],
  paused: ['sending', 'cancelled'],
  sent: [],
  failed: ['draft'],    // can retry from draft
  cancelled: ['draft'], // can re-draft
};

// ─── Audience Filters ────────────────────────────────────────────────────────

export interface AudienceFilters {
  leadStatus?: string[];
  priority?: string[];
  source?: string[];
  state?: string[];
  tags?: string[];
  userType?: string[];
  financialYear?: string;
  hasConsent?: boolean;
}

export interface CustomRecipient {
  mobile?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

// ─── A/B Test Config ─────────────────────────────────────────────────────────

export interface ABTestVariant {
  name: string;
  subject?: string;
  body: string;
  percentage: number;
}

export interface ABTestConfig {
  enabled: boolean;
  variants: ABTestVariant[];
  winnerMetric: 'open_rate' | 'click_rate';
  winnerSelectedAt?: Date;
}

// ─── Cost Estimation ─────────────────────────────────────────────────────────

export interface CostPerMessage {
  sms: number;     // cents — default 750 ($0.075)
  email: number;   // cents — default 10 ($0.001)
  whatsapp: number; // cents — default 500 ($0.05)
}

export const DEFAULT_COST_PER_MESSAGE: CostPerMessage = {
  sms: 750,
  email: 10,
  whatsapp: 500,
};

// ─── Campaign Document ───────────────────────────────────────────────────────

export interface IBroadcastCampaign {
  campaignId: string;
  name: string;
  channel: BroadcastChannel;
  status: CampaignStatus;
  audienceType: AudienceType;
  audienceFilters?: AudienceFilters;
  customList?: CustomRecipient[];
  smsTemplateId?: Types.ObjectId;
  emailTemplateId?: Types.ObjectId;
  whatsappTemplateId?: Types.ObjectId;
  smsBody?: string;
  emailSubject?: string;
  emailBody?: string;
  whatsappTemplateName?: string;
  whatsappTemplateParams?: string[];
  scheduledAt?: Date;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  openCount: number;
  clickCount: number;
  optOutCount: number;
  abTest?: ABTestConfig;
  costEstimate: number; // cents
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBroadcastCampaignDocument extends IBroadcastCampaign, Document {
  _id: Types.ObjectId;
}

// ─── Template Document ───────────────────────────────────────────────────────

export interface IBroadcastTemplate {
  name: string;
  channel: SingleChannel;
  category: TemplateCategory;
  subject?: string; // email only
  body: string;
  isActive: boolean;
  usageCount: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBroadcastTemplateDocument extends IBroadcastTemplate, Document {
  _id: Types.ObjectId;
}

// ─── Message Document (per-recipient) ────────────────────────────────────────

export interface IBroadcastMessage {
  campaignId: Types.ObjectId;
  recipientId?: Types.ObjectId;
  recipientType: 'lead' | 'user' | 'custom';
  recipientMobile?: string;
  recipientEmail?: string;
  channel: SingleChannel;
  status: MessageStatus;
  gatewayId?: string;
  error?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  abVariant?: string;
  /**
   * Per-recipient merge data, captured at audience-resolution time.
   * Frozen at queue-creation so subsequent edits to the source
   * Lead/User doc don't change what gets sent. Used by the queue
   * processor to render `{{firstName}}` etc. before handing off
   * to a provider.
   */
  mergeData?: Record<string, string>;
  createdAt: Date;
}

export interface IBroadcastMessageDocument extends IBroadcastMessage, Document {
  _id: Types.ObjectId;
}

// ─── Opt-Out Document ────────────────────────────────────────────────────────

export interface IOptOut {
  contact: string; // E.164 phone or email
  contactType: 'mobile' | 'email';
  channel: SingleChannel | 'all';
  reason: OptOutReason;
  campaignId?: Types.ObjectId;
  createdAt: Date;
}

export interface IOptOutDocument extends IOptOut, Document {
  _id: Types.ObjectId;
}

// ─── Consent Record Document ─────────────────────────────────────────────────

export interface IConsentRecord {
  contactId: Types.ObjectId;
  contactType: 'user' | 'lead';
  channel: SingleChannel | 'push';
  consented: boolean;
  consentSource: ConsentSource;
  consentDate: Date;
  consentEvidence?: string;
  withdrawnAt?: Date;
  createdAt: Date;
}

export interface IConsentRecordDocument extends IConsentRecord, Document {
  _id: Types.ObjectId;
}

// ─── Channel Provider Interface ──────────────────────────────────────────────

export interface ChannelContent {
  to: string;
  body: string;
  subject?: string;   // email only
  htmlBody?: string;   // email only
  templateName?: string; // whatsapp only
  templateParams?: string[]; // whatsapp only
  from?: string;
}

export interface SendResult {
  success: boolean;
  gatewayId?: string;
  error?: string;
}

export interface DeliveryStatus {
  gatewayId: string;
  status: 'sent' | 'delivered' | 'failed' | 'bounced';
  timestamp?: Date;
  error?: string;
}

export interface IChannelProvider {
  channel: SingleChannel;
  send(content: ChannelContent): Promise<SendResult>;
  checkDeliveryStatus?(gatewayId: string): Promise<DeliveryStatus>;
}

// ─── Merge Tag Defaults ──────────────────────────────────────────────────────

export const MERGE_TAG_FALLBACKS: Record<string, string> = {
  firstName: 'Valued Client',
  lastName: '',
  leadNumber: '',
  orderNumber: '',
  serviceName: '',
  financialYear: '',
  deadlineDate: '',
  staffName: '',
  companyName: 'QEGOS',
};

// ─── Rate Limits ─────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  smsPerSecond: number;       // default 10
  emailPerSecond: number;     // default 100
  whatsappPerSecond: number;  // default 80
  smsBatchSize: number;       // default 2500
  emailBatchSize: number;     // default 500
  whatsappBatchSize: number;  // default 500
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  smsPerSecond: 10,
  emailPerSecond: 100,
  whatsappPerSecond: 80,
  smsBatchSize: 2500,
  emailBatchSize: 500,
  whatsappBatchSize: 500,
};

// ─── Engine Config ───────────────────────────────────────────────────────────

export interface BroadcastEngineConfig {
  // Twilio
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;

  // Amazon SES
  sesRegion?: string;
  sesAccessKeyId?: string;
  sesSecretAccessKey?: string;
  sesFromEmail?: string;

  // WhatsApp (Meta Cloud API)
  whatsappApiToken?: string;
  whatsappPhoneNumberId?: string;

  // Business identity (Spam Act compliance)
  businessName: string;
  businessAbn?: string;
  unsubscribeBaseUrl?: string;

  // Rate limiting
  rateLimits?: Partial<RateLimitConfig>;

  // Cost per message (cents)
  costPerMessage?: Partial<CostPerMessage>;
}

// ─── Init Result ─────────────────────────────────────────────────────────────

export interface BroadcastEngineInitResult {
  CampaignModel: Model<IBroadcastCampaignDocument>;
  TemplateModel: Model<IBroadcastTemplateDocument>;
  MessageModel: Model<IBroadcastMessageDocument>;
  OptOutModel: Model<IOptOutDocument>;
  ConsentModel: Model<IConsentRecordDocument>;
  providers: Map<SingleChannel, IChannelProvider>;
}

// ─── Route Dependencies ──────────────────────────────────────────────────────

export interface BroadcastRouteDeps {
  CampaignModel: Model<IBroadcastCampaignDocument>;
  TemplateModel: Model<IBroadcastTemplateDocument>;
  MessageModel: Model<IBroadcastMessageDocument>;
  OptOutModel: Model<IOptOutDocument>;
  ConsentModel: Model<IConsentRecordDocument>;
  LeadModel: Model<Document>;
  UserModel: Model<Document>;
  authenticate: () => RequestHandler;
  checkPermission: import('@nugen/rbac').CheckPermissionFn;
  auditLog?: import('@nugen/audit-log').AuditLogDI;
  providers: Map<SingleChannel, IChannelProvider>;
  redisClient: unknown; // ioredis instance
  config: BroadcastEngineConfig;
}

// ─── Resolved Recipient ──────────────────────────────────────────────────────

export interface ResolvedRecipient {
  recipientId?: Types.ObjectId;
  recipientType: 'lead' | 'user' | 'custom';
  mobile?: string;
  email?: string;
  mergeData: Record<string, string>;
}

// ─── Campaign Stats ──────────────────────────────────────────────────────────

export interface CampaignStats {
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  bouncedCount: number;
  openCount: number;
  clickCount: number;
  optOutCount: number;
  deliveryRate: number;  // percentage
  openRate: number;      // percentage (email only)
  clickRate: number;     // percentage (email only)
  optOutRate: number;    // percentage
}
