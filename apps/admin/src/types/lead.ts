export enum LeadStatus {
  New = 1,
  Contacted = 2,
  Qualified = 3,
  QuoteSent = 4,
  Negotiation = 5,
  Won = 6,
  Lost = 7,
  Dormant = 8,
}

export const LEAD_STATUS_LABELS: Record<number, string> = {
  [LeadStatus.New]: 'New',
  [LeadStatus.Contacted]: 'Contacted',
  [LeadStatus.Qualified]: 'Qualified',
  [LeadStatus.QuoteSent]: 'Quote Sent',
  [LeadStatus.Negotiation]: 'Negotiation',
  [LeadStatus.Won]: 'Won',
  [LeadStatus.Lost]: 'Lost',
  [LeadStatus.Dormant]: 'Dormant',
};

export const LEAD_STATUS_COLORS: Record<number, string> = {
  [LeadStatus.New]: 'blue',
  [LeadStatus.Contacted]: 'cyan',
  [LeadStatus.Qualified]: 'geekblue',
  [LeadStatus.QuoteSent]: 'purple',
  [LeadStatus.Negotiation]: 'orange',
  [LeadStatus.Won]: 'green',
  [LeadStatus.Lost]: 'red',
  [LeadStatus.Dormant]: 'default',
};

export const LEAD_STATUS_TRANSITIONS: Record<number, number[]> = {
  [LeadStatus.New]: [LeadStatus.Contacted, LeadStatus.Lost, LeadStatus.Dormant],
  [LeadStatus.Contacted]: [LeadStatus.Qualified, LeadStatus.Lost, LeadStatus.Dormant],
  [LeadStatus.Qualified]: [LeadStatus.QuoteSent, LeadStatus.Contacted, LeadStatus.Lost, LeadStatus.Dormant],
  [LeadStatus.QuoteSent]: [LeadStatus.Negotiation, LeadStatus.Qualified, LeadStatus.Lost, LeadStatus.Dormant],
  [LeadStatus.Negotiation]: [LeadStatus.Won, LeadStatus.QuoteSent, LeadStatus.Lost, LeadStatus.Dormant],
  [LeadStatus.Won]: [],
  [LeadStatus.Lost]: [LeadStatus.New],
  [LeadStatus.Dormant]: [LeadStatus.New],
};

export type LeadSource =
  | 'phone_inbound' | 'phone_outbound' | 'walk_in' | 'web_form'
  | 'referral' | 'sms_inquiry' | 'whatsapp' | 'social_media'
  | 'marketing_campaign' | 'repeat_client' | 'partner'
  | 'google_ads' | 'facebook_ads' | 'other';

export const LEAD_SOURCES: LeadSource[] = [
  'phone_inbound', 'phone_outbound', 'walk_in', 'web_form',
  'referral', 'sms_inquiry', 'whatsapp', 'social_media',
  'marketing_campaign', 'repeat_client', 'partner',
  'google_ads', 'facebook_ads', 'other',
];

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  phone_inbound: 'Phone (Inbound)',
  phone_outbound: 'Phone (Outbound)',
  walk_in: 'Walk-in',
  web_form: 'Web Form',
  referral: 'Referral',
  sms_inquiry: 'SMS Inquiry',
  whatsapp: 'WhatsApp',
  social_media: 'Social Media',
  marketing_campaign: 'Marketing Campaign',
  repeat_client: 'Repeat Client',
  partner: 'Partner',
  google_ads: 'Google Ads',
  facebook_ads: 'Facebook Ads',
  other: 'Other',
};

export type LeadPriority = 'hot' | 'warm' | 'cold';

export const LEAD_PRIORITY_COLORS: Record<string, string> = {
  hot: 'red',
  warm: 'orange',
  cold: 'blue',
};

export interface Lead {
  _id: string;
  leadNumber: string;
  source: LeadSource;
  firstName: string;
  lastName: string;
  mobile?: string;
  email?: string;
  status: number;
  priority: LeadPriority;
  score: number;
  assignedTo?: string;
  assignedToName?: string;
  nextAction?: string;
  nextActionDate?: string;
  lastContactedAt?: string;
  isConverted: boolean;
  convertedOrderId?: string;
  lostReason?: string;
  lostReasonNote?: string;
  serviceInterest?: string[];
  tags?: string[];
  notes?: string;
  state?: string;
  financialYear?: string;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeadActivity {
  _id: string;
  leadId: string;
  type: string;
  description: string;
  performedBy?: string;
  performedByName?: string;
  isSystemGenerated: boolean;
  outcome?: string;
  sentiment?: string;
  callDirection?: string;
  callDuration?: number;
  createdAt: string;
}

export interface LeadReminder {
  _id: string;
  leadId: string;
  title: string;
  description?: string;
  reminderDate: string;
  assignedTo: string;
  assignedToName?: string;
  isCompleted: boolean;
  isOverdue: boolean;
  isSnoozed: boolean;
  snoozedUntil?: string;
  createdAt: string;
}

export interface LeadListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: number;
  priority?: string;
  source?: string;
  assignedTo?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
