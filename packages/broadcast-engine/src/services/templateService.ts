import type { Model } from 'mongoose';
import type {
  IBroadcastTemplateDocument,
  SingleChannel,
  TemplateCategory,
  BroadcastEngineConfig,
} from '../types';
import { MERGE_TAG_FALLBACKS } from '../types';

// ─── Module State ────────────────────────────────────────────────────────────

let TemplateModel: Model<IBroadcastTemplateDocument>;

export function initTemplateService(
  model: Model<IBroadcastTemplateDocument>,
  _config: BroadcastEngineConfig,
): void {
  TemplateModel = model;
}

// ─── Merge Tag Rendering ─────────────────────────────────────────────────────

/**
 * Replace {{tag}} patterns with merge data values.
 * BRC-INV-08: Never send unresolved tags — use fallback values.
 */
export function renderMergeTags(template: string, mergeData: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, tag: string) => {
    if (tag in mergeData && mergeData[tag] !== undefined && mergeData[tag] !== '') {
      return mergeData[tag];
    }
    // Fallback — never send unresolved tags
    return MERGE_TAG_FALLBACKS[tag] ?? '';
  });
}

/**
 * BRC-INV-02: SMS auto-appends "Reply STOP to unsubscribe".
 * Cannot be removed.
 */
export function appendSmsFooter(body: string): string {
  const footer = '\n\nReply STOP to unsubscribe';
  if (body.includes('Reply STOP to unsubscribe')) {
    return body; // Already has footer
  }
  return body + footer;
}

/**
 * BRC-INV-03: Email auto-appends sender identification (business name + ABN)
 * and unsubscribe link. Cannot be removed.
 */
export function appendEmailFooter(
  htmlBody: string,
  config: BroadcastEngineConfig,
  unsubscribeUrl?: string,
): string {
  const businessLine = config.businessAbn
    ? `${config.businessName} (ABN: ${config.businessAbn})`
    : config.businessName;

  const unsubLink = unsubscribeUrl ?? `${config.unsubscribeBaseUrl ?? '#'}/unsubscribe`;

  const footer = `
<hr style="margin-top:32px;border:none;border-top:1px solid #ddd;">
<p style="font-size:12px;color:#666;margin-top:16px;">
  ${businessLine}<br>
  <a href="${unsubLink}" style="color:#666;">Unsubscribe</a>
</p>`;

  if (htmlBody.includes('</body>')) {
    return htmlBody.replace('</body>', `${footer}</body>`);
  }
  return htmlBody + footer;
}

/**
 * Render a full message body with merge tags resolved and compliance footers applied.
 */
export function renderMessage(
  channel: SingleChannel,
  body: string,
  mergeData: Record<string, string>,
  config: BroadcastEngineConfig,
  options?: { subject?: string; unsubscribeUrl?: string },
): { body: string; subject?: string; htmlBody?: string } {
  const rendered = renderMergeTags(body, mergeData);

  if (channel === 'sms') {
    return { body: appendSmsFooter(rendered) };
  }

  if (channel === 'email') {
    const subject = options?.subject ? renderMergeTags(options.subject, mergeData) : undefined;
    const htmlBody = appendEmailFooter(rendered, config, options?.unsubscribeUrl);
    return { body: rendered, subject, htmlBody };
  }

  // WhatsApp — no footer modification needed (templates are pre-approved by Meta)
  return { body: rendered };
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function createTemplate(data: {
  name: string;
  channel: SingleChannel;
  category: TemplateCategory;
  subject?: string;
  body: string;
  createdBy: string;
}): Promise<IBroadcastTemplateDocument> {
  const template = await TemplateModel.create({
    ...data,
    isActive: true,
    usageCount: 0,
  });
  return template;
}

export async function listTemplates(filters: {
  channel?: SingleChannel;
  category?: TemplateCategory;
  isActive?: boolean;
  page?: number;
  limit?: number;
}): Promise<{ templates: IBroadcastTemplateDocument[]; total: number }> {
  const query: Record<string, unknown> = {};
  if (filters.channel) {
    query.channel = filters.channel;
  }
  if (filters.category) {
    query.category = filters.category;
  }
  if (filters.isActive !== undefined) {
    query.isActive = filters.isActive;
  }

  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;

  const [templates, total] = await Promise.all([
    TemplateModel.find(query)
      .sort({ usageCount: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    TemplateModel.countDocuments(query),
  ]);

  return { templates, total };
}

export async function updateTemplate(
  id: string,
  data: Partial<{
    name: string;
    subject: string;
    body: string;
    isActive: boolean;
    category: TemplateCategory;
  }>,
): Promise<IBroadcastTemplateDocument | null> {
  return TemplateModel.findByIdAndUpdate(id, { $set: data }, { new: true });
}

export async function getTemplateById(id: string): Promise<IBroadcastTemplateDocument | null> {
  return TemplateModel.findById(id);
}

export async function incrementUsageCount(id: string): Promise<void> {
  await TemplateModel.findByIdAndUpdate(id, { $inc: { usageCount: 1 } });
}
