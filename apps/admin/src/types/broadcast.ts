/**
 * Broadcast — admin-side wire types.
 *
 * Mirrors the engine's public surface in
 * `packages/broadcast-engine/src/types.ts`. Keep these in sync when
 * the engine adds new fields.
 */

// ─── Channels ────────────────────────────────────────────────────────

export type SingleChannel = 'sms' | 'email' | 'whatsapp';
export type CampaignChannel = SingleChannel | 'sms_email' | 'all';

export const CHANNEL_LABELS: Record<CampaignChannel, string> = {
  sms: 'SMS',
  email: 'Email',
  whatsapp: 'WhatsApp',
  sms_email: 'SMS + Email',
  all: 'All channels',
};

export const CHANNEL_COLORS: Record<CampaignChannel, string> = {
  sms: 'cyan',
  email: 'blue',
  whatsapp: 'green',
  sms_email: 'purple',
  all: 'magenta',
};

// ─── Status ──────────────────────────────────────────────────────────

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'paused'
  | 'sent'
  | 'failed'
  | 'cancelled';

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  sending: 'Sending',
  paused: 'Paused',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const CAMPAIGN_STATUS_COLORS: Record<CampaignStatus, string> = {
  draft: 'default',
  scheduled: 'blue',
  sending: 'processing',
  paused: 'orange',
  sent: 'green',
  failed: 'red',
  cancelled: 'red',
};

// ─── Audience ────────────────────────────────────────────────────────

export type AudienceType =
  | 'all_leads'
  | 'filtered_leads'
  | 'all_users'
  | 'filtered_users'
  | 'custom_list';

export const AUDIENCE_TYPE_LABELS: Record<AudienceType, string> = {
  all_leads: 'All leads',
  filtered_leads: 'Filtered leads',
  all_users: 'All users',
  filtered_users: 'Filtered users',
  custom_list: 'Custom recipient list',
};

export interface AudienceFilters {
  leadStatus?: string[];
  priority?: string[];
  source?: string[];
  state?: string[];
  tags?: string[];
  userType?: string[];
  financialYear?: string;
}

export interface CustomRecipient {
  mobile?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

// ─── Templates ───────────────────────────────────────────────────────

export type TemplateCategory =
  | 'follow_up'
  | 'promotion'
  | 'reminder'
  | 'announcement'
  | 'welcome'
  | 're_engagement'
  | 'deadline'
  | 'review_request';

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  follow_up: 'Follow-up',
  promotion: 'Promotion',
  reminder: 'Reminder',
  announcement: 'Announcement',
  welcome: 'Welcome',
  re_engagement: 'Re-engagement',
  deadline: 'Deadline',
  review_request: 'Review request',
};

export interface BroadcastTemplate {
  _id: string;
  name: string;
  channel: SingleChannel;
  category: TemplateCategory;
  subject?: string;
  body: string;
  isActive: boolean;
  usageCount: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateInput {
  name: string;
  channel: SingleChannel;
  category: TemplateCategory;
  subject?: string;
  body: string;
}

export type UpdateTemplateInput = Partial<
  Omit<CreateTemplateInput, 'channel'>
> & { isActive?: boolean };

export interface TemplateListQuery {
  channel?: SingleChannel;
  category?: TemplateCategory;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

// ─── Merge tags ──────────────────────────────────────────────────────

/**
 * Engine-supported merge tags + their fallback strings. Used by the
 * editor's "insert tag" UI and to prefill preview data so admins can
 * see what their template will render against a real recipient.
 */
export const MERGE_TAGS = [
  { tag: 'firstName', label: 'First name', sample: 'Jane' },
  { tag: 'lastName', label: 'Last name', sample: 'Doe' },
  { tag: 'leadNumber', label: 'Lead number', sample: 'QGS-L-0001' },
  { tag: 'orderNumber', label: 'Order number', sample: 'QGS-O-0042' },
  { tag: 'serviceName', label: 'Service name', sample: 'Individual return' },
  { tag: 'financialYear', label: 'Financial year', sample: '2024-25' },
  { tag: 'deadlineDate', label: 'Deadline date', sample: '2025-10-31' },
  { tag: 'staffName', label: 'Staff name', sample: 'Jasmine' },
  { tag: 'companyName', label: 'Company name', sample: 'QEGOS' },
] as const;

// ─── Campaign ────────────────────────────────────────────────────────

export interface CampaignStats {
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  bouncedCount: number;
  openCount: number;
  clickCount: number;
  optOutCount: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  optOutRate: number;
}

export interface Campaign {
  _id: string;
  campaignId: string;
  name: string;
  channel: CampaignChannel;
  status: CampaignStatus;

  audienceType: AudienceType;
  audienceFilters?: AudienceFilters;
  customList?: CustomRecipient[];

  smsTemplateId?: string;
  emailTemplateId?: string;
  whatsappTemplateId?: string;

  smsBody?: string;
  emailSubject?: string;
  emailBody?: string;
  whatsappTemplateName?: string;
  whatsappTemplateParams?: string[];

  scheduledAt?: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  openCount: number;
  clickCount: number;
  optOutCount?: number;
  costEstimate?: number;
  createdAt: string;
  updatedAt: string;

  stats?: CampaignStats;
}

export interface CreateCampaignInput {
  name: string;
  channel: CampaignChannel;
  audienceType: AudienceType;
  audienceFilters?: AudienceFilters;
  customList?: CustomRecipient[];

  smsTemplateId?: string;
  emailTemplateId?: string;
  whatsappTemplateId?: string;

  smsBody?: string;
  emailSubject?: string;
  emailBody?: string;
  whatsappTemplateName?: string;
  whatsappTemplateParams?: string[];

  scheduledAt?: string;
}

export interface CampaignListQuery {
  page?: number;
  limit?: number;
  status?: CampaignStatus;
  channel?: CampaignChannel;
}

export interface PreviewInput {
  channel: SingleChannel;
  body: string;
  subject?: string;
  mergeData?: Record<string, string>;
}

export interface PreviewResult {
  body: string;
  subject?: string;
  htmlBody?: string;
}

export interface AudienceCountResult {
  count: number;
  costEstimate: number;
}
