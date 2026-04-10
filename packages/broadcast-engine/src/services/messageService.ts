import type { Model, Types } from 'mongoose';
import type {
  IBroadcastMessageDocument,
  IBroadcastCampaignDocument,
  IOptOutDocument,
  SingleChannel,
  MessageStatus,
  CampaignStats,
} from '../types';

// ─── Module State ────────────────────────────────────────────────────────────

let MessageModel: Model<IBroadcastMessageDocument>;
let CampaignModel: Model<IBroadcastCampaignDocument>;
let OptOutModel: Model<IOptOutDocument>;

export function initMessageService(
  messageModel: Model<IBroadcastMessageDocument>,
  campaignModel: Model<IBroadcastCampaignDocument>,
  optOutModel: Model<IOptOutDocument>,
): void {
  MessageModel = messageModel;
  CampaignModel = campaignModel;
  OptOutModel = optOutModel;
}

// ─── Message CRUD ────────────────────────────────────────────────────────────

export async function createMessages(
  campaignId: Types.ObjectId,
  messages: Array<{
    recipientId?: Types.ObjectId;
    recipientType: 'lead' | 'user' | 'custom';
    recipientMobile?: string;
    recipientEmail?: string;
    channel: SingleChannel;
    abVariant?: string;
    mergeData?: Record<string, string>;
  }>,
): Promise<number> {
  if (messages.length === 0) return 0;

  const docs = messages.map((m) => ({
    campaignId,
    ...m,
    status: 'queued' as MessageStatus,
  }));

  const result = await MessageModel.insertMany(docs, { ordered: false });
  return result.length;
}

export async function getQueuedMessages(
  campaignId: Types.ObjectId,
  channel: SingleChannel,
  batchSize: number,
): Promise<IBroadcastMessageDocument[]> {
  return MessageModel.find({
    campaignId,
    channel,
    status: 'queued',
  })
    .sort({ createdAt: 1 })
    .limit(batchSize);
}

export async function updateMessageStatus(
  messageId: Types.ObjectId,
  status: MessageStatus,
  extra?: { gatewayId?: string; error?: string; sentAt?: Date; deliveredAt?: Date; openedAt?: Date; clickedAt?: Date },
): Promise<void> {
  await MessageModel.findByIdAndUpdate(messageId, {
    $set: { status, ...extra },
  });
}

export async function updateMessageByGatewayId(
  gatewayId: string,
  status: MessageStatus,
  extra?: { deliveredAt?: Date; openedAt?: Date; clickedAt?: Date; error?: string },
): Promise<void> {
  await MessageModel.findOneAndUpdate(
    { gatewayId },
    { $set: { status, ...extra } },
  );
}

// ─── Bounce Handling (BRC-INV-04) ────────────────────────────────────────────

/**
 * Hard bounce → immediate DND for email.
 * Spam complaint → immediate DND for all channels.
 */
export async function handleBounce(
  gatewayId: string,
  bounceType: 'hard' | 'soft' | 'complaint',
): Promise<void> {
  const message = await MessageModel.findOne({ gatewayId });
  if (!message) return;

  await updateMessageStatus(message._id, 'bounced');

  const contact = message.recipientEmail ?? message.recipientMobile;
  if (!contact) return;

  if (bounceType === 'hard') {
    // Immediate DND for this channel
    await OptOutModel.findOneAndUpdate(
      { contact, channel: message.channel },
      {
        $setOnInsert: {
          contact,
          contactType: message.recipientEmail ? 'email' : 'mobile',
          channel: message.channel,
          reason: 'bounce_hard',
          campaignId: message.campaignId,
        },
      },
      { upsert: true },
    );
  } else if (bounceType === 'complaint') {
    // Spam complaint → DND all channels
    await OptOutModel.findOneAndUpdate(
      { contact, channel: 'all' },
      {
        $setOnInsert: {
          contact,
          contactType: message.recipientEmail ? 'email' : 'mobile',
          channel: 'all',
          reason: 'spam_complaint',
          campaignId: message.campaignId,
        },
      },
      { upsert: true },
    );
  } else {
    // Soft bounce — check if 3x for this contact
    const softBounceCount = await MessageModel.countDocuments({
      $or: [
        { recipientEmail: contact },
        { recipientMobile: contact },
      ],
      status: 'bounced',
    });

    if (softBounceCount >= 3) {
      await OptOutModel.findOneAndUpdate(
        { contact, channel: message.channel },
        {
          $setOnInsert: {
            contact,
            contactType: message.recipientEmail ? 'email' : 'mobile',
            channel: message.channel,
            reason: 'bounce_soft_3x',
            campaignId: message.campaignId,
          },
        },
        { upsert: true },
      );
    }
  }
}

// ─── Campaign Stats ──────────────────────────────────────────────────────────

export async function getCampaignStats(campaignId: Types.ObjectId): Promise<CampaignStats> {
  const pipeline = [
    { $match: { campaignId } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        sent: { $sum: { $cond: [{ $in: ['$status', ['sent', 'delivered', 'opened', 'clicked']] }, 1, 0] } },
        delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        bounced: { $sum: { $cond: [{ $eq: ['$status', 'bounced'] }, 1, 0] } },
        opened: { $sum: { $cond: [{ $in: ['$status', ['opened', 'clicked']] }, 1, 0] } },
        clicked: { $sum: { $cond: [{ $eq: ['$status', 'clicked'] }, 1, 0] } },
        optedOut: { $sum: { $cond: [{ $eq: ['$status', 'opted_out'] }, 1, 0] } },
      },
    },
  ];

  const [result] = await MessageModel.aggregate(pipeline);

  if (!result) {
    return {
      totalRecipients: 0, sentCount: 0, deliveredCount: 0,
      failedCount: 0, bouncedCount: 0, openCount: 0,
      clickCount: 0, optOutCount: 0,
      deliveryRate: 0, openRate: 0, clickRate: 0, optOutRate: 0,
    };
  }

  const total = result.total || 1; // avoid division by zero
  const sentForRates = result.sent || 1;

  return {
    totalRecipients: result.total,
    sentCount: result.sent,
    deliveredCount: result.delivered,
    failedCount: result.failed,
    bouncedCount: result.bounced,
    openCount: result.opened,
    clickCount: result.clicked,
    optOutCount: result.optedOut,
    deliveryRate: Math.round((result.delivered / total) * 10000) / 100,
    openRate: Math.round((result.opened / sentForRates) * 10000) / 100,
    clickRate: Math.round((result.clicked / sentForRates) * 10000) / 100,
    optOutRate: Math.round((result.optedOut / total) * 10000) / 100,
  };
}

/**
 * Sync campaign counters from message aggregation.
 */
export async function syncCampaignCounters(campaignId: Types.ObjectId): Promise<void> {
  const stats = await getCampaignStats(campaignId);
  await CampaignModel.findByIdAndUpdate(campaignId, {
    $set: {
      totalRecipients: stats.totalRecipients,
      sentCount: stats.sentCount,
      failedCount: stats.failedCount,
      openCount: stats.openCount,
      clickCount: stats.clickCount,
      optOutCount: stats.optOutCount,
    },
  });
}

// ─── Per-Recipient Message Log ───────────────────────────────────────────────

export async function getMessageLog(
  campaignId: Types.ObjectId,
  page: number = 1,
  limit: number = 50,
  statusFilter?: MessageStatus,
): Promise<{ messages: IBroadcastMessageDocument[]; total: number }> {
  const query: Record<string, unknown> = { campaignId };
  if (statusFilter) query.status = statusFilter;

  const [messages, total] = await Promise.all([
    MessageModel.find(query)
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    MessageModel.countDocuments(query),
  ]);

  return { messages, total };
}

/**
 * Check if all messages for a campaign have been processed.
 */
export async function isCampaignComplete(campaignId: Types.ObjectId): Promise<boolean> {
  const remaining = await MessageModel.countDocuments({
    campaignId,
    status: { $in: ['queued', 'sending'] },
  });
  return remaining === 0;
}
