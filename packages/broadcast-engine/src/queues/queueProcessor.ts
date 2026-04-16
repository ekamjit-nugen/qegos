import type { Model, Types } from 'mongoose';
import type {
  IBroadcastCampaignDocument,
  IBroadcastMessageDocument,
  SingleChannel,
  IChannelProvider,
  BroadcastEngineConfig,
  RateLimitConfig,
} from '../types';
import { DEFAULT_RATE_LIMITS } from '../types';
import {
  getQueuedMessages,
  updateMessageStatus,
  isCampaignComplete,
  syncCampaignCounters,
} from '../services/messageService';
import { renderMessage } from '../services/templateService';

// ─── Module State ────────────────────────────────────────────────────────────

let CampaignModel: Model<IBroadcastCampaignDocument>;
let providers: Map<SingleChannel, IChannelProvider>;
let engineConfig: BroadcastEngineConfig;
let rateLimits: RateLimitConfig;

export function initQueueProcessor(
  campaignModel: Model<IBroadcastCampaignDocument>,
  _messageModel: Model<IBroadcastMessageDocument>,
  channelProviders: Map<SingleChannel, IChannelProvider>,
  config: BroadcastEngineConfig,
): void {
  CampaignModel = campaignModel;
  providers = channelProviders;
  engineConfig = config;
  rateLimits = { ...DEFAULT_RATE_LIMITS, ...config.rateLimits };
}

// ─── Rate-Limited Delay ──────────────────────────────────────────────────────

function getDelayMs(channel: SingleChannel): number {
  const perSecond =
    channel === 'sms'
      ? rateLimits.smsPerSecond
      : channel === 'email'
        ? rateLimits.emailPerSecond
        : rateLimits.whatsappPerSecond;

  return Math.ceil(1000 / perSecond);
}

function getBatchSize(channel: SingleChannel): number {
  return channel === 'sms'
    ? rateLimits.smsBatchSize
    : channel === 'email'
      ? rateLimits.emailBatchSize
      : rateLimits.whatsappBatchSize;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Process a Single Campaign Channel ───────────────────────────────────────

/**
 * Process queued messages for a campaign on a specific channel.
 * Rate-limited: delays between sends to respect provider limits.
 * Retries: 3 attempts with exponential backoff.
 */
export async function processChannelQueue(
  campaignId: Types.ObjectId,
  channel: SingleChannel,
): Promise<{ sent: number; failed: number }> {
  const provider = providers.get(channel);
  if (!provider) {
    return { sent: 0, failed: 0 };
  }

  const campaign = await CampaignModel.findById(campaignId);
  if (!campaign || campaign.status !== 'sending') {
    return { sent: 0, failed: 0 };
  }

  const batchSize = getBatchSize(channel);
  const delayMs = getDelayMs(channel);
  const messages = await getQueuedMessages(campaignId, channel, batchSize);

  let sent = 0;
  let failed = 0;

  // Resolve body from campaign
  const body =
    channel === 'email'
      ? (campaign.emailBody ?? '')
      : channel === 'sms'
        ? (campaign.smsBody ?? '')
        : '';

  const subject = channel === 'email' ? campaign.emailSubject : undefined;

  for (const msg of messages) {
    // Mark as sending
    await updateMessageStatus(msg._id, 'sending');

    const recipient = channel === 'email' ? msg.recipientEmail : msg.recipientMobile;

    if (!recipient) {
      await updateMessageStatus(msg._id, 'failed', { error: 'No recipient contact' });
      failed++;
      continue;
    }

    // Render message with the per-recipient merge data captured at
    // queue-creation time (audienceService → campaignService →
    // messageModel.mergeData). Falls back to {} for legacy messages
    // queued before this field existed.
    const mergeData = (msg.mergeData ?? {}) as Record<string, string>;
    const rendered = renderMessage(channel, body, mergeData, engineConfig, { subject });

    // Attempt send with retries
    let lastError = '';
    let sendSuccess = false;

    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await provider.send({
        to: recipient,
        body: rendered.body,
        subject: rendered.subject,
        htmlBody: rendered.htmlBody,
        templateName: campaign.whatsappTemplateName ?? undefined,
        templateParams: campaign.whatsappTemplateParams,
      });

      if (result.success) {
        await updateMessageStatus(msg._id, 'sent', {
          gatewayId: result.gatewayId,
          sentAt: new Date(),
        });
        sent++;
        sendSuccess = true;
        break;
      }

      lastError = result.error ?? 'Unknown error';

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < 2) {
        await sleep(1000 * Math.pow(2, attempt));
      }
    }

    if (!sendSuccess) {
      await updateMessageStatus(msg._id, 'failed', { error: lastError });
      failed++;
    }

    // Rate limiting delay
    await sleep(delayMs);
  }

  return { sent, failed };
}

// ─── Trigger Scheduled Campaigns ─────────────────────────────────────────────

/**
 * Cron job: find campaigns where scheduledAt <= now and status = 'scheduled'.
 * Transition to 'sending' and start queue processing.
 */
export async function triggerScheduledCampaigns(): Promise<number> {
  const now = new Date();
  const scheduled = await CampaignModel.find({
    status: 'scheduled',
    scheduledAt: { $lte: now },
  });

  let triggered = 0;
  for (const campaign of scheduled) {
    await CampaignModel.findByIdAndUpdate(campaign._id, {
      $set: { status: 'sending' },
    });
    triggered++;
  }

  return triggered;
}

// ─── Check Campaign Completion ───────────────────────────────────────────────

/**
 * Cron job: check sending campaigns for completion.
 * Mark as 'sent' when all messages are processed.
 */
export async function checkCampaignCompletion(): Promise<number> {
  const sending = await CampaignModel.find({ status: 'sending' });

  let completed = 0;
  for (const campaign of sending) {
    const done = await isCampaignComplete(campaign._id);
    if (done) {
      await syncCampaignCounters(campaign._id);
      await CampaignModel.findByIdAndUpdate(campaign._id, {
        $set: { status: 'sent' },
      });
      completed++;
    }
  }

  return completed;
}
