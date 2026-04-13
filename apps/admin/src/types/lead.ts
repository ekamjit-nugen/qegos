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
  [LeadStatus.New]: [LeadStatus.Contacted, LeadStatus.Lost],
  [LeadStatus.Contacted]: [LeadStatus.Qualified, LeadStatus.Lost, LeadStatus.Dormant],
  [LeadStatus.Qualified]: [LeadStatus.QuoteSent, LeadStatus.Lost, LeadStatus.Dormant],
  [LeadStatus.QuoteSent]: [LeadStatus.Negotiation, LeadStatus.Won, LeadStatus.Lost, LeadStatus.Dormant],
  [LeadStatus.Negotiation]: [LeadStatus.Won, LeadStatus.Lost, LeadStatus.Dormant],
  [LeadStatus.Won]: [],
  [LeadStatus.Lost]: [LeadStatus.New],
  [LeadStatus.Dormant]: [LeadStatus.Contacted],
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
  preferredLanguage?: string;
  preferredContact?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  financialYear?: string;
  serviceInterest?: string[];
  estimatedValue?: number;
  maritalStatus?: string;
  hasSpouse?: boolean;
  numberOfDependants?: number;
  employmentType?: string;
  hasRentalProperty?: boolean;
  hasSharePortfolio?: boolean;
  hasForeignIncome?: boolean;
  status: number;
  priority: LeadPriority;
  score: number;
  assignedTo?: string;
  assignedToName?: string;
  nextAction?: string;
  nextActionDate?: string;
  followUpCount?: number;
  lastContactedAt?: string;
  isConverted: boolean;
  convertedOrderId?: string;
  convertedUserId?: string;
  lostReason?: string;
  lostReasonNote?: string;
  tags?: string[];
  notes?: string;
  costPerLead?: number;
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

// ─── Lost Reasons (must match backend lead.types.ts LOST_REASONS) ───────────
export const LOST_REASONS = [
  'price_too_high',
  'chose_competitor',
  'diy_filing',
  'not_interested',
  'unreachable',
  'timing',
  'already_filed',
  'other',
] as const;

export const LOST_REASON_LABELS: Record<string, string> = {
  price_too_high: 'Price Too High',
  chose_competitor: 'Chose Competitor',
  diy_filing: 'DIY Filing',
  not_interested: 'Not Interested',
  unreachable: 'Unreachable',
  timing: 'Bad Timing',
  already_filed: 'Already Filed',
  other: 'Other',
};

// ─── Activity Types (must match backend lead.types.ts ACTIVITY_TYPES) ───────
export const ACTIVITY_TYPES = [
  'phone_call_outbound',
  'phone_call_inbound',
  'phone_call_missed',
  'sms_sent',
  'sms_received',
  'email_sent',
  'email_received',
  'whatsapp_sent',
  'whatsapp_received',
  'walk_in_meeting',
  'video_call',
  'voicemail_left',
  'note',
  'status_change',
  'assignment_change',
  'follow_up_scheduled',
  'follow_up_completed',
  'follow_up_missed',
  'document_shared',
  'quote_sent',
  'converted',
] as const;

/** User-selectable activity types (excludes system-generated ones) */
export const USER_ACTIVITY_TYPES = [
  'phone_call_outbound',
  'phone_call_inbound',
  'phone_call_missed',
  'sms_sent',
  'email_sent',
  'whatsapp_sent',
  'walk_in_meeting',
  'video_call',
  'voicemail_left',
  'note',
  'document_shared',
  'quote_sent',
] as const;

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  phone_call_outbound: 'Outbound Call',
  phone_call_inbound: 'Inbound Call',
  phone_call_missed: 'Missed Call',
  sms_sent: 'SMS Sent',
  sms_received: 'SMS Received',
  email_sent: 'Email Sent',
  email_received: 'Email Received',
  whatsapp_sent: 'WhatsApp Sent',
  whatsapp_received: 'WhatsApp Received',
  walk_in_meeting: 'Walk-in Meeting',
  video_call: 'Video Call',
  voicemail_left: 'Voicemail Left',
  note: 'Note',
  status_change: 'Status Change',
  assignment_change: 'Assignment Change',
  follow_up_scheduled: 'Follow-up Scheduled',
  follow_up_completed: 'Follow-up Completed',
  follow_up_missed: 'Follow-up Missed',
  document_shared: 'Document Shared',
  quote_sent: 'Quote Sent',
  converted: 'Converted',
};

/** Grouped activity types for the dropdown selector */
export const ACTIVITY_TYPE_GROUPS = [
  {
    label: 'Calls',
    options: [
      { value: 'phone_call_outbound', label: 'Outbound Call' },
      { value: 'phone_call_inbound', label: 'Inbound Call' },
      { value: 'phone_call_missed', label: 'Missed Call' },
      { value: 'voicemail_left', label: 'Voicemail Left' },
    ],
  },
  {
    label: 'Messages',
    options: [
      { value: 'sms_sent', label: 'SMS Sent' },
      { value: 'email_sent', label: 'Email Sent' },
      { value: 'whatsapp_sent', label: 'WhatsApp Sent' },
    ],
  },
  {
    label: 'Meetings',
    options: [
      { value: 'walk_in_meeting', label: 'Walk-in Meeting' },
      { value: 'video_call', label: 'Video Call' },
    ],
  },
  {
    label: 'Other',
    options: [
      { value: 'note', label: 'Note' },
      { value: 'document_shared', label: 'Document Shared' },
      { value: 'quote_sent', label: 'Quote Sent' },
    ],
  },
];

// ─── Activity Outcomes (must match backend lead.types.ts ACTIVITY_OUTCOMES) ─
export const ACTIVITY_OUTCOMES = [
  'interested',
  'callback_requested',
  'not_interested',
  'no_answer',
  'voicemail',
  'busy',
  'wrong_number',
  'meeting_booked',
  'quote_requested',
  'converted',
  'needs_documents',
  'thinking',
  'price_enquiry',
  'other',
] as const;

export const ACTIVITY_OUTCOME_LABELS: Record<string, string> = {
  interested: 'Interested',
  callback_requested: 'Callback Requested',
  not_interested: 'Not Interested',
  no_answer: 'No Answer',
  voicemail: 'Voicemail',
  busy: 'Busy',
  wrong_number: 'Wrong Number',
  meeting_booked: 'Meeting Booked',
  quote_requested: 'Quote Requested',
  converted: 'Converted',
  needs_documents: 'Needs Documents',
  thinking: 'Thinking',
  price_enquiry: 'Price Enquiry',
  other: 'Other',
};

export const SENTIMENTS = ['positive', 'neutral', 'negative'] as const;

export const SENTIMENT_LABELS: Record<string, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
};

export const CALL_DIRECTIONS = ['inbound', 'outbound'] as const;

// ─── Demographic Enums ─────────────────────────────────────────────────────
export const MARITAL_STATUSES = ['single', 'married', 'de_facto', 'separated', 'divorced', 'widowed'] as const;
export const MARITAL_STATUS_LABELS: Record<string, string> = {
  single: 'Single', married: 'Married', de_facto: 'De Facto',
  separated: 'Separated', divorced: 'Divorced', widowed: 'Widowed',
};

export const EMPLOYMENT_TYPES = ['employed', 'self_employed', 'contractor', 'retired', 'student', 'unemployed', 'multiple'] as const;
export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  employed: 'Employed', self_employed: 'Self Employed', contractor: 'Contractor',
  retired: 'Retired', student: 'Student', unemployed: 'Unemployed', multiple: 'Multiple',
};

export const PREFERRED_LANGUAGES = ['en', 'zh', 'hi', 'pa', 'vi', 'ar', 'other'] as const;
export const PREFERRED_LANGUAGE_LABELS: Record<string, string> = {
  en: 'English', zh: 'Chinese', hi: 'Hindi', pa: 'Punjabi', vi: 'Vietnamese', ar: 'Arabic', other: 'Other',
};

export const PREFERRED_CONTACTS = ['call', 'sms', 'email', 'whatsapp'] as const;
export const PREFERRED_CONTACT_LABELS: Record<string, string> = {
  call: 'Phone Call', sms: 'SMS', email: 'Email', whatsapp: 'WhatsApp',
};

export interface LeadStats {
  byStatus: Record<string, { count: number; totalValue: number }>;
  bySource: Record<string, number>;
  totalActive: number;
  newThisWeek: number;
  conversionRate: { total: number; converted: number; rate: number };
  pipelineValue?: number;
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
