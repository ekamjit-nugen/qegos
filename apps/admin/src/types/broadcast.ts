export type CampaignChannel = 'sms' | 'email' | 'whatsapp' | 'sms_email';

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

export interface Campaign {
  _id: string;
  campaignId: string;
  name: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  openCount: number;
  clickCount: number;
  scheduledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignListQuery {
  page?: number;
  limit?: number;
  status?: CampaignStatus;
  channel?: CampaignChannel;
}
