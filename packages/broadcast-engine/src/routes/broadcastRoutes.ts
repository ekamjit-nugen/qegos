import { Router, type Request, type Response } from 'express';
import { validationResult } from 'express-validator';
import type { BroadcastRouteDeps, SingleChannel, MessageStatus } from '../types';
import * as campaignService from '../services/campaignService';
import * as templateService from '../services/templateService';
import * as messageService from '../services/messageService';
import {
  createCampaignValidation,
  updateCampaignValidation,
  campaignIdValidation,
  listCampaignsValidation,
  campaignMessagesValidation,
  previewCampaignValidation,
  createTemplateValidation,
  updateTemplateValidation,
  listTemplatesValidation,
  createOptOutValidation,
  listOptOutsValidation,
  checkOptOutValidation,
  importOptOutsValidation,
} from '../validators/broadcastValidators';

interface AuthenticatedRequest extends Request {
  user?: { _id: string; role?: string };
  scopeFilter?: Record<string, unknown>;
}

function handleValidation(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ status: 422, code: 'VALIDATION_ERROR', errors: errors.array() });
    return false;
  }
  return true;
}

export function createBroadcastRoutes(deps: BroadcastRouteDeps): Router {
  const router = Router();
  const { authenticate, checkPermission, auditLog, OptOutModel, ConsentModel, MessageModel } = deps;

  // All routes require authentication
  router.use(authenticate() as never);

  // ═══════════════════════════════════════════════════════════════════════════
  // CAMPAIGN ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /campaigns — Create campaign (draft)
  router.post(
    '/campaigns',
    checkPermission('broadcasts', 'create') as never,
    ...createCampaignValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const authReq = req as AuthenticatedRequest;
      const campaign = await campaignService.createCampaign({
        ...req.body,
        createdBy: authReq.user!._id,
      });
      auditLog?.log({
        actor: authReq.user!._id, actorType: 'admin', action: 'create',
        resource: 'broadcast_campaign', resourceId: String(campaign._id),
        description: `Created campaign: ${campaign.name}`, severity: 'info',
      }).catch((err: unknown) => { console.warn('[AUDIT] Failed:', err); }); // eslint-disable-line no-console
      res.status(201).json({ status: 201, data: campaign });
    },
  );

  // GET /campaigns — List campaigns
  router.get(
    '/campaigns',
    checkPermission('broadcasts', 'read') as never,
    ...listCampaignsValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const { status, channel, page, limit } = req.query as Record<string, string>;
      const result = await campaignService.listCampaigns({
        status: status as never,
        channel: channel as never,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
      res.json({ status: 200, data: result.campaigns, meta: { total: result.total } });
    },
  );

  // GET /campaigns/:id — Campaign detail
  router.get(
    '/campaigns/:id',
    checkPermission('broadcasts', 'read') as never,
    ...campaignIdValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const campaign = await campaignService.getCampaign(req.params.id);
      if (!campaign) { res.status(404).json({ status: 404, code: 'NOT_FOUND' }); return; }
      const stats = await messageService.getCampaignStats(campaign._id);
      res.json({ status: 200, data: { ...campaign.toObject(), stats } });
    },
  );

  // PUT /campaigns/:id — Edit draft/paused campaign
  router.put(
    '/campaigns/:id',
    checkPermission('broadcasts', 'update') as never,
    ...updateCampaignValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const campaign = await campaignService.updateCampaign(req.params.id, req.body);
      if (!campaign) {
        res.status(400).json({ status: 400, code: 'INVALID_STATE', message: 'Campaign not found or not editable' });
        return;
      }
      res.json({ status: 200, data: campaign });
    },
  );

  // POST /campaigns/:id/send — Send or schedule
  router.post(
    '/campaigns/:id/send',
    checkPermission('broadcasts', 'update') as never,
    ...campaignIdValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const authReq = req as AuthenticatedRequest;
      const result = await campaignService.sendCampaign(req.params.id);
      if (!result.success) {
        res.status(400).json({ status: 400, code: 'SEND_FAILED', message: result.error });
        return;
      }
      auditLog?.log({
        actor: authReq.user!._id, actorType: 'admin', action: 'status_change',
        resource: 'broadcast_campaign', resourceId: req.params.id,
        description: `Sent campaign (${result.totalQueued} queued)`, severity: 'info',
      }).catch((err: unknown) => { console.warn('[AUDIT] Failed:', err); }); // eslint-disable-line no-console
      res.json({ status: 200, data: { totalQueued: result.totalQueued } });
    },
  );

  // PATCH /campaigns/:id/pause
  router.patch(
    '/campaigns/:id/pause',
    checkPermission('broadcasts', 'update') as never,
    ...campaignIdValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const campaign = await campaignService.pauseCampaign(req.params.id);
      if (!campaign) { res.status(400).json({ status: 400, code: 'INVALID_STATE' }); return; }
      res.json({ status: 200, data: campaign });
    },
  );

  // PATCH /campaigns/:id/resume
  router.patch(
    '/campaigns/:id/resume',
    checkPermission('broadcasts', 'update') as never,
    ...campaignIdValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const campaign = await campaignService.resumeCampaign(req.params.id);
      if (!campaign) { res.status(400).json({ status: 400, code: 'INVALID_STATE' }); return; }
      res.json({ status: 200, data: campaign });
    },
  );

  // POST /campaigns/:id/duplicate
  router.post(
    '/campaigns/:id/duplicate',
    checkPermission('broadcasts', 'create') as never,
    ...campaignIdValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const authReq = req as AuthenticatedRequest;
      const campaign = await campaignService.duplicateCampaign(req.params.id, authReq.user!._id);
      if (!campaign) { res.status(404).json({ status: 404, code: 'NOT_FOUND' }); return; }
      res.status(201).json({ status: 201, data: campaign });
    },
  );

  // POST /campaigns/:id/preview
  router.post(
    '/campaigns/:id/preview',
    checkPermission('broadcasts', 'read') as never,
    ...previewCampaignValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const campaign = await campaignService.getCampaign(req.params.id);
      if (!campaign) { res.status(404).json({ status: 404, code: 'NOT_FOUND' }); return; }

      const { channel, mergeData = {} } = req.body as { channel: SingleChannel; mergeData?: Record<string, string> };
      const body = channel === 'email' ? campaign.emailBody : campaign.smsBody;
      const subject = channel === 'email' ? campaign.emailSubject : undefined;

      if (!body) {
        res.status(400).json({ status: 400, code: 'NO_BODY', message: `No body for ${channel}` });
        return;
      }

      const preview = campaignService.previewMessage(channel, body, mergeData, subject);
      res.json({ status: 200, data: preview });
    },
  );

  // POST /campaigns/:id/audience-count
  router.post(
    '/campaigns/:id/audience-count',
    checkPermission('broadcasts', 'read') as never,
    ...campaignIdValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const result = await campaignService.getAudienceCountAndCost(req.params.id);
      if (!result) { res.status(404).json({ status: 404, code: 'NOT_FOUND' }); return; }
      res.json({ status: 200, data: result });
    },
  );

  // GET /campaigns/:id/messages — Per-recipient delivery log
  router.get(
    '/campaigns/:id/messages',
    checkPermission('broadcasts', 'read') as never,
    ...campaignMessagesValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const { page, limit, status } = req.query as Record<string, string>;
      const result = await messageService.getMessageLog(
        req.params.id as never,
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined,
        status as MessageStatus | undefined,
      );
      res.json({ status: 200, data: result.messages, meta: { total: result.total } });
    },
  );

  // GET /campaigns/:id/stats — Delivery stats
  router.get(
    '/campaigns/:id/stats',
    checkPermission('broadcasts', 'read') as never,
    ...campaignIdValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const stats = await messageService.getCampaignStats(req.params.id as never);
      res.json({
        status: 200,
        data: stats,
        disclaimer: 'Open tracking may be blocked by some email clients (Apple Mail Privacy Protection). Actual opens may be 30-50% higher.',
      });
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /templates
  router.post(
    '/templates',
    checkPermission('broadcasts', 'create') as never,
    ...createTemplateValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const authReq = req as AuthenticatedRequest;
      const template = await templateService.createTemplate({
        ...req.body,
        createdBy: authReq.user!._id,
      });
      res.status(201).json({ status: 201, data: template });
    },
  );

  // GET /templates
  router.get(
    '/templates',
    checkPermission('broadcasts', 'read') as never,
    ...listTemplatesValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const { channel, category, isActive, page, limit } = req.query as Record<string, string>;
      const result = await templateService.listTemplates({
        channel: channel as never,
        category: category as never,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
      res.json({ status: 200, data: result.templates, meta: { total: result.total } });
    },
  );

  // PUT /templates/:id
  router.put(
    '/templates/:id',
    checkPermission('broadcasts', 'update') as never,
    ...updateTemplateValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const template = await templateService.updateTemplate(req.params.id, req.body);
      if (!template) { res.status(404).json({ status: 404, code: 'NOT_FOUND' }); return; }
      res.json({ status: 200, data: template });
    },
  );

  // DELETE /templates/:id — Soft-delete template (deactivate)
  router.delete(
    '/templates/:id',
    checkPermission('broadcasts', 'delete') as never,
    ...campaignIdValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const template = await templateService.updateTemplate(req.params.id, { isActive: false });
      if (!template) { res.status(404).json({ status: 404, code: 'NOT_FOUND' }); return; }
      res.json({ status: 200, data: { message: 'Template deactivated' } });
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSENT ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /consent — List consent records
  router.get(
    '/consent',
    checkPermission('broadcasts', 'read') as never,
    async (req: Request, res: Response): Promise<void> => {
      const { contactId, channel, page = 1, limit = 20 } = req.query as {
        contactId?: string; channel?: string; page?: number; limit?: number;
      };
      const filter: Record<string, unknown> = {};
      if (contactId) filter.contactId = contactId;
      if (channel) filter.channel = channel;

      const pageNum = Number(page);
      const limitNum = Number(limit);
      const [records, total] = await Promise.all([
        ConsentModel.find(filter).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
        ConsentModel.countDocuments(filter),
      ]);
      res.json({ status: 200, data: records, pagination: { page: pageNum, limit: limitNum, total } });
    },
  );

  // GET /consent/:contactId — Get consent for a specific contact
  router.get(
    '/consent/:contactId',
    checkPermission('broadcasts', 'read') as never,
    async (req: Request, res: Response): Promise<void> => {
      const records = await ConsentModel.find({ contactId: req.params.contactId }).lean();
      res.json({ status: 200, data: records });
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // OPT-OUT ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /optouts — Add to DND
  router.post(
    '/optouts',
    checkPermission('broadcasts', 'create') as never,
    ...createOptOutValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const optOut = await OptOutModel.findOneAndUpdate(
        { contact: req.body.contact, channel: req.body.channel },
        { $setOnInsert: req.body },
        { upsert: true, new: true },
      );
      res.status(201).json({ status: 201, data: optOut });
    },
  );

  // GET /optouts — List
  router.get(
    '/optouts',
    checkPermission('broadcasts', 'read') as never,
    ...listOptOutsValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const { channel, contactType, page = '1', limit = '50' } = req.query as Record<string, string>;
      const query: Record<string, unknown> = {};
      if (channel) query.channel = channel;
      if (contactType) query.contactType = contactType;

      const [optOuts, total] = await Promise.all([
        OptOutModel.find(query)
          .sort({ createdAt: -1 })
          .skip((Number(page) - 1) * Number(limit))
          .limit(Number(limit)),
        OptOutModel.countDocuments(query),
      ]);
      res.json({ status: 200, data: optOuts, meta: { total } });
    },
  );

  // POST /optouts/check — Check if opted out
  router.post(
    '/optouts/check',
    checkPermission('broadcasts', 'read') as never,
    ...checkOptOutValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const { contact, channel } = req.body as { contact: string; channel: string };
      const optOut = await OptOutModel.findOne({
        contact,
        $or: [{ channel }, { channel: 'all' }],
      });
      res.json({ status: 200, data: { optedOut: optOut !== null, record: optOut } });
    },
  );

  // POST /optouts/import — Bulk import DND
  router.post(
    '/optouts/import',
    checkPermission('broadcasts', 'create') as never,
    ...importOptOutsValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const { entries } = req.body as { entries: Array<{ contact: string; contactType: string; channel: string; reason: string }> };

      let imported = 0;
      let skipped = 0;
      for (const entry of entries) {
        const result = await OptOutModel.findOneAndUpdate(
          { contact: entry.contact, channel: entry.channel },
          { $setOnInsert: entry },
          { upsert: true, new: true, rawResult: true },
        );
        if (result.lastErrorObject?.updatedExisting) {
          skipped++;
        } else {
          imported++;
        }
      }
      res.json({ status: 200, data: { imported, skipped, total: entries.length } });
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARD & EXPORT
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /dashboard — Overall broadcast analytics
  router.get(
    '/dashboard',
    checkPermission('broadcasts', 'read') as never,
    async (_req: Request, res: Response): Promise<void> => {
      const pipeline = [
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalRecipients: { $sum: '$totalRecipients' },
            totalSent: { $sum: '$sentCount' },
            totalFailed: { $sum: '$failedCount' },
          },
        },
      ];
      const stats = await deps.CampaignModel.aggregate(pipeline);

      const totals = {
        campaigns: 0,
        recipients: 0,
        sent: 0,
        failed: 0,
        byStatus: {} as Record<string, number>,
      };

      for (const s of stats) {
        totals.campaigns += s.count;
        totals.recipients += s.totalRecipients;
        totals.sent += s.totalSent;
        totals.failed += s.totalFailed;
        totals.byStatus[s._id as string] = s.count;
      }

      res.json({ status: 200, data: totals });
    },
  );

  // POST /campaigns/:id/export — Export delivery report
  router.post(
    '/campaigns/:id/export',
    checkPermission('broadcasts', 'read') as never,
    ...campaignIdValidation(),
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const campaign = await campaignService.getCampaign(req.params.id);
      if (!campaign) { res.status(404).json({ status: 404, code: 'NOT_FOUND' }); return; }

      // Stream CSV delivery report
      const messages = await MessageModel.find({ campaignId: campaign._id }).lean();

      const header = 'recipientType,recipientMobile,recipientEmail,channel,status,gatewayId,sentAt,deliveredAt,error\n';
      const rows = messages.map((m) => {
        const escape = (v: unknown): string => {
          const s = String(v ?? '');
          return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        };
        return [
          m.recipientType, m.recipientMobile, m.recipientEmail,
          m.channel, m.status, m.gatewayId,
          m.sentAt?.toISOString(), m.deliveredAt?.toISOString(), m.error,
        ].map(escape).join(',');
      }).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="campaign-${campaign.campaignId}-report.csv"`);
      res.send(header + rows);
    },
  );

  return router;
}
