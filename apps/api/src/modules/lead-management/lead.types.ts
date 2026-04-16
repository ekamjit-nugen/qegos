import type { Document, Types } from 'mongoose';

// ─── Lead Status Enum ───────────────────────────────────────────────────────

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

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  [LeadStatus.New]: 'New',
  [LeadStatus.Contacted]: 'Contacted',
  [LeadStatus.Qualified]: 'Qualified',
  [LeadStatus.QuoteSent]: 'Quote Sent',
  [LeadStatus.Negotiation]: 'Negotiation',
  [LeadStatus.Won]: 'Won/Converted',
  [LeadStatus.Lost]: 'Lost',
  [LeadStatus.Dormant]: 'Dormant',
};

/**
 * LM-INV-02: Status transitions follow defined state machine.
 * Won(6) is terminal — transitions only through convert.
 */
export const LEAD_STATUS_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  [LeadStatus.New]: [LeadStatus.Contacted, LeadStatus.Lost],
  [LeadStatus.Contacted]: [LeadStatus.Qualified, LeadStatus.Lost, LeadStatus.Dormant],
  [LeadStatus.Qualified]: [LeadStatus.QuoteSent, LeadStatus.Lost, LeadStatus.Dormant],
  [LeadStatus.QuoteSent]: [
    LeadStatus.Negotiation,
    LeadStatus.Won,
    LeadStatus.Lost,
    LeadStatus.Dormant,
  ],
  [LeadStatus.Negotiation]: [LeadStatus.Won, LeadStatus.Lost, LeadStatus.Dormant],
  [LeadStatus.Won]: [], // Terminal — no further transitions
  [LeadStatus.Lost]: [LeadStatus.New], // Reopen
  [LeadStatus.Dormant]: [LeadStatus.Contacted], // Re-engage
};

// ─── Enums ──────────────────────────────────────────────────────────────────

export const LEAD_SOURCES = [
  'phone_inbound',
  'phone_outbound',
  'walk_in',
  'web_form',
  'referral',
  'sms_inquiry',
  'whatsapp',
  'social_media',
  'marketing_campaign',
  'repeat_client',
  'partner',
  'google_ads',
  'facebook_ads',
  'other',
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_PRIORITIES = ['hot', 'warm', 'cold'] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

export const PREFERRED_LANGUAGES = ['en', 'zh', 'hi', 'pa', 'vi', 'ar', 'other'] as const;
export type PreferredLanguage = (typeof PREFERRED_LANGUAGES)[number];

export const PREFERRED_CONTACTS = ['call', 'sms', 'email', 'whatsapp'] as const;
export type PreferredContact = (typeof PREFERRED_CONTACTS)[number];

export const AU_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'] as const;
export type AuState = (typeof AU_STATES)[number];

export const MARITAL_STATUSES = [
  'single',
  'married',
  'de_facto',
  'separated',
  'divorced',
  'widowed',
] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const EMPLOYMENT_TYPES = [
  'employed',
  'self_employed',
  'contractor',
  'retired',
  'student',
  'unemployed',
  'multiple',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

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
export type LostReason = (typeof LOST_REASONS)[number];

// ─── Activity Enums ─────────────────────────────────────────────────────────

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
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

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
export type ActivityOutcome = (typeof ACTIVITY_OUTCOMES)[number];

export const SENTIMENTS = ['positive', 'neutral', 'negative'] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const CALL_DIRECTIONS = ['inbound', 'outbound'] as const;
export type CallDirection = (typeof CALL_DIRECTIONS)[number];

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface ILead {
  leadNumber: string;
  source: LeadSource;
  firstName: string;
  lastName?: string;
  mobile: string;
  email?: string;
  preferredLanguage?: PreferredLanguage;
  preferredContact?: PreferredContact;
  suburb?: string;
  state?: AuState;
  postcode?: string;
  financialYear?: string;
  serviceInterest: Types.ObjectId[];
  estimatedValue?: number; // integer cents (LM-INV-12)
  maritalStatus?: MaritalStatus;
  hasSpouse?: boolean;
  numberOfDependants?: number;
  employmentType?: EmploymentType;
  hasRentalProperty?: boolean;
  hasSharePortfolio?: boolean;
  hasForeignIncome?: boolean;
  status: LeadStatus;
  priority: LeadPriority;
  score: number;
  assignedTo?: Types.ObjectId;
  nextAction?: string;
  nextActionDate?: Date;
  followUpCount: number;
  lastContactedAt?: Date;
  isConverted: boolean;
  convertedOrderId?: Types.ObjectId;
  convertedUserId?: Types.ObjectId;
  lostReason?: LostReason;
  lostReasonNote?: string;
  tags: string[];
  campaignId?: Types.ObjectId;
  referralCode?: string;
  costPerLead?: number; // integer cents
  isDeleted: boolean;
  deletedAt?: Date;
}

export interface ILeadDocument extends ILead, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ILeadActivityAttachment {
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
}

export interface ILeadActivity {
  leadId: Types.ObjectId;
  type: ActivityType;
  subject?: string;
  description: string;
  outcome?: ActivityOutcome;
  sentiment?: Sentiment;
  callDuration?: number; // seconds
  callDirection?: CallDirection;
  nextAction?: string;
  nextActionDate?: Date;
  quotedAmount?: number; // integer cents
  servicesQuoted: Types.ObjectId[];
  performedBy: Types.ObjectId;
  attachments: ILeadActivityAttachment[];
  isSystemGenerated: boolean;
}

export interface ILeadActivityDocument extends ILeadActivity, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ILeadReminder {
  leadId: Types.ObjectId;
  assignedTo: Types.ObjectId;
  reminderDate: Date;
  reminderTime: string; // HH:mm
  title: string;
  description?: string;
  isCompleted: boolean;
  completedAt?: Date;
  isOverdue: boolean;
  isSnoozed: boolean;
  snoozedUntil?: Date;
  notificationSent: boolean;
}

export interface ILeadReminderDocument extends ILeadReminder, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Lead Scoring ───────────────────────────────────────────────────────────

export interface LeadScoreFactors {
  hasEmail: boolean;
  completeProfile: boolean;
  hasRentalProperty: boolean;
  hasSharePortfolio: boolean;
  isSelfEmployed: boolean;
  multipleServices: boolean;
  hasSpouse: boolean;
  hasDependants: boolean;
  positiveOutcome: boolean;
  quoteRequested: boolean;
  referralSource: boolean;
  repeatClient: boolean;
  recentContact: boolean;
  hasForeignIncome: boolean;
  overdueFollowUps: boolean;
  multipleNoAnswer: boolean;
  goneCold: boolean;
}

export interface DuplicateMatch {
  leadId: Types.ObjectId;
  leadNumber: string;
  firstName: string;
  lastName?: string;
  mobile: string;
  email?: string;
  matchedOn: ('mobile' | 'email')[];
  confidence: 'high' | 'medium';
}

export interface LeadListQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  status?: number;
  priority?: string;
  source?: string;
  assignedTo?: string;
  dateFrom?: string;
  dateTo?: string;
  state?: string;
  tags?: string;
  hasFollowUpDue?: string;
  scopeFilter?: Record<string, unknown>;
}

export interface LeadListResult {
  leads: ILeadDocument[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Automation Job Types ───────────────────────────────────────────────────

export type LeadAutomationJob =
  | 'lead.autoAssign'
  | 'lead.staleAlert'
  | 'lead.autoDormant'
  | 'lead.followUpEscalation'
  | 'lead.overdueMarker'
  | 'lead.scoreRecalculation'
  | 'lead.reEngagementFlag';

// ─── Event Types ────────────────────────────────────────────────────────────

export type LeadEvent =
  | 'lead.created'
  | 'lead.updated'
  | 'lead.statusChanged'
  | 'lead.assigned'
  | 'lead.converted'
  | 'lead.merged'
  | 'lead.scored'
  | 'lead.activityLogged';
