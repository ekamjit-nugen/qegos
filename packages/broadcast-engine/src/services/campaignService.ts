import type { Model, Types } from 'mongoose';
import type {
  IBroadcastCampaignDocument,
  IBroadcastTemplateDocument,
  CampaignStatus,
  BroadcastChannel,
  AudienceType,
  AudienceFilters,
  CustomRecipient,
  ABTestConfig,
  SingleChannel,
  BroadcastEngineConfig,
  IChannelProvider,
  CostPerMessage,
} from '../types';
import { CAMPAIGN_STATUS_TRANSITIONS, DEFAULT_COST_PER_MESSAGE } from '../types';
import { resolveAudience, getAudienceCount } from './audienceService';
import { createMessages } from './messageService';
import { renderMessage, incrementUsageCount } from './templateService';

// ─── Module State ────────────────────────────────────────────────────────────

let CampaignModel: Model<IBroadcastCampaignDocument>;
let engineConfig: BroadcastEngineConfig;
let providers: Map<SingleChannel, IChannelProvider>;

export function initCampaignService(
  campaignModel: Model<IBroadcastCampaignDocument>,
  _templateModel: Model<IBroadcastTemplateDocument>,
  config: BroadcastEngineConfig,
  channelProviders: Map<SingleChannel, IChannelProvider>,
): void {
  CampaignModel = campaignModel;
  engineConfig = config;
  providers = channelProviders;
}

// ─── Status Machine ──────────────────────────────────────────────────────────

export function isValidTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return CAMPAIGN_STATUS_TRANSITIONS[from].includes(to);
}

async function transitionStatus(
  campaignId: Types.ObjectId,
  currentStatus: CampaignStatus,
  newStatus: CampaignStatus,
): Promise<IBroadcastCampaignDocument | null> {
  if (!isValidTransition(currentStatus, newStatus)) {
    return null;
  }
  return CampaignModel.findByIdAndUpdate(
    campaignId,
    { $set: { status: newStatus } },
    { new: true },
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getChannelsForBroadcast(channel: BroadcastChannel): SingleChannel[] {
  switch (channel) {
    case 'sms': return ['sms'];
    case 'email': return ['email'];
    case 'whatsapp': return ['whatsapp'];
    case 'sms_email': return ['sms', 'email'];
    case 'all': return ['sms', 'email', 'whatsapp'];
    default: return [];
  }
}

function calculateCost(
  recipientCount: number,
  channels: SingleChannel[],
  costConfig?: Partial<CostPerMessage>,
): number {
  const costs = { ...DEFAULT_COST_PER_MESSAGE, ...costConfig };
  let total = 0;
  for (const ch of channels) {
    total += recipientCount * costs[ch];
  }
  return total;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function createCampaign(data: {
  name: string;
  channel: BroadcastChannel;
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
  scheduledAt?: Date;
  abTest?: ABTestConfig;
  createdBy: string;
}): Promise<IBroadcastCampaignDocument> {
  // Calculate cost estimate
  const channels = getChannelsForBroadcast(data.channel);
  const audienceCount = await getAudienceCount(
    data.audienceType,
    data.audienceFilters,
    data.customList,
  );
  const costEstimate = calculateCost(audienceCount, channels, engineConfig.costPerMessage);

  const campaign = await CampaignModel.create({
    ...data,
    status: 'draft',
    totalRecipients: audienceCount,
    costEstimate,
    sentCount: 0,
    failedCount: 0,
    openCount: 0,
    clickCount: 0,
    optOutCount: 0,
  });

  return campaign;
}

export async function getCampaign(id: string): Promise<IBroadcastCampaignDocument | null> {
  return CampaignModel.findById(id);
}

export async function listCampaigns(filters: {
  status?: CampaignStatus;
  channel?: BroadcastChannel;
  page?: number;
  limit?: number;
}): Promise<{ campaigns: IBroadcastCampaignDocument[]; total: number }> {
  const query: Record<string, unknown> = {};
  if (filters.status) query.status = filters.status;
  if (filters.channel) query.channel = filters.channel;

  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;

  const [campaigns, total] = await Promise.all([
    CampaignModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    CampaignModel.countDocuments(query),
  ]);

  return { campaigns, total };
}

/**
 * BRC-INV-05: Only draft/paused campaigns are editable.
 */
export async function updateCampaign(
  id: string,
  data: Partial<{
    name: string;
    channel: BroadcastChannel;
    audienceType: AudienceType;
    audienceFilters: AudienceFilters;
    customList: CustomRecipient[];
    smsTemplateId: string;
    emailTemplateId: string;
    whatsappTemplateId: string;
    smsBody: string;
    emailSubject: string;
    emailBody: string;
    whatsappTemplateName: string;
    whatsappTemplateParams: string[];
    scheduledAt: Date;
    abTest: ABTestConfig;
  }>,
): Promise<IBroadcastCampaignDocument | null> {
  const campaign = await CampaignModel.findById(id);
  if (!campaign) return null;

  if (campaign.status !== 'draft' && campaign.status !== 'paused') {
    return null; // BRC-INV-05
  }

  return CampaignModel.findByIdAndUpdate(id, { $set: data }, { new: true });
}

// ─── Send / Schedule ─────────────────────────────────────────────────────────

/**
 * Send campaign immediately or schedule for later.
 * BRC-INV-06: Audience recalculated at execution time.
 */
export async function sendCampaign(
  id: string,
): Promise<{ success: boolean; error?: string; totalQueued?: number }> {
  const campaign = await CampaignModel.findById(id);
  if (!campaign) return { success: false, error: 'Campaign not found' };

  if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
    return { success: false, error: `Cannot send campaign in ${campaign.status} status` };
  }

  // If scheduledAt is in the future, set to scheduled
  if (campaign.scheduledAt && campaign.scheduledAt > new Date()) {
    await transitionStatus(campaign._id, campaign.status, 'scheduled');
    return { success: true, totalQueued: 0 };
  }

  // Resolve audience at execution time (BRC-INV-06)
  const channels = getChannelsForBroadcast(campaign.channel);
  let totalQueued = 0;

  for (const ch of channels) {
    if (!providers.has(ch)) continue;

    const recipients = await resolveAudience(
      campaign.audienceType,
      ch,
      campaign.audienceFilters,
      campaign.customList,
    );

    if (recipients.length === 0) continue;

    // Create message docs for queue processing
    const messageDocs = recipients.map((r) => ({
      recipientId: r.recipientId,
      recipientType: r.recipientType,
      recipientMobile: r.mobile,
      recipientEmail: r.email,
      channel: ch,
    }));

    const count = await createMessages(campaign._id, messageDocs);
    totalQueued += count;
  }

  // Update counters and status
  const newStatus = totalQueued > 0 ? 'sending' : 'sent';
  await CampaignModel.findByIdAndUpdate(campaign._id, {
    $set: {
      status: newStatus,
      totalRecipients: totalQueued,
      costEstimate: calculateCost(totalQueued, channels, engineConfig.costPerMessage),
    },
  });

  // Increment template usage counts
  if (campaign.smsTemplateId) await incrementUsageCount(String(campaign.smsTemplateId));
  if (campaign.emailTemplateId) await incrementUsageCount(String(campaign.emailTemplateId));
  if (campaign.whatsappTemplateId) await incrementUsageCount(String(campaign.whatsappTemplateId));

  return { success: true, totalQueued };
}

// ─── Pause / Resume ──────────────────────────────────────────────────────────

export async function pauseCampaign(id: string): Promise<IBroadcastCampaignDocument | null> {
  const campaign = await CampaignModel.findById(id);
  if (!campaign) return null;
  return transitionStatus(campaign._id, campaign.status, 'paused');
}

export async function resumeCampaign(id: string): Promise<IBroadcastCampaignDocument | null> {
  const campaign = await CampaignModel.findById(id);
  if (!campaign) return null;
  return transitionStatus(campaign._id, campaign.status, 'sending');
}

export async function cancelCampaign(id: string): Promise<IBroadcastCampaignDocument | null> {
  const campaign = await CampaignModel.findById(id);
  if (!campaign) return null;
  return transitionStatus(campaign._id, campaign.status, 'cancelled');
}

// ─── Duplicate ───────────────────────────────────────────────────────────────

export async function duplicateCampaign(id: string, createdBy: string): Promise<IBroadcastCampaignDocument | null> {
  const original = await CampaignModel.findById(id);
  if (!original) return null;

  const clone = await CampaignModel.create({
    name: `${original.name} (Copy)`,
    channel: original.channel,
    audienceType: original.audienceType,
    audienceFilters: original.audienceFilters,
    customList: original.customList,
    smsTemplateId: original.smsTemplateId,
    emailTemplateId: original.emailTemplateId,
    whatsappTemplateId: original.whatsappTemplateId,
    smsBody: original.smsBody,
    emailSubject: original.emailSubject,
    emailBody: original.emailBody,
    whatsappTemplateName: original.whatsappTemplateName,
    whatsappTemplateParams: original.whatsappTemplateParams,
    abTest: original.abTest,
    status: 'draft',
    totalRecipients: 0,
    costEstimate: 0,
    sentCount: 0,
    failedCount: 0,
    openCount: 0,
    clickCount: 0,
    optOutCount: 0,
    createdBy,
  });

  return clone;
}

// ─── Preview ─────────────────────────────────────────────────────────────────

export function previewMessage(
  channel: SingleChannel,
  body: string,
  mergeData: Record<string, string>,
  subject?: string,
): { body: string; subject?: string; htmlBody?: string } {
  return renderMessage(channel, body, mergeData, engineConfig, { subject });
}

// ─── Audience Count + Cost ───────────────────────────────────────────────────

export async function getAudienceCountAndCost(
  id: string,
): Promise<{ count: number; costEstimate: number } | null> {
  const campaign = await CampaignModel.findById(id);
  if (!campaign) return null;

  const count = await getAudienceCount(
    campaign.audienceType,
    campaign.audienceFilters,
    campaign.customList,
  );

  const channels = getChannelsForBroadcast(campaign.channel);
  const costEstimate = calculateCost(count, channels, engineConfig.costPerMessage);

  // Update campaign with fresh count
  await CampaignModel.findByIdAndUpdate(id, {
    $set: { totalRecipients: count, costEstimate },
  });

  return { count, costEstimate };
}
