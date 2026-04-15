import { Router, type Request, type Response, type NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { createHmac } from 'crypto';
import type { Types } from 'mongoose';
import type { WhatsAppRouteDeps } from '../types';
import {
  sendTemplateValidation,
  sendFreeformValidation,
  updateConfigValidation,
  getConversationValidation,
} from '../validators/whatsappValidators';
import {
  initWhatsAppService,
  getConfig,
  updateConfig,
  logOutboundMessage,
  logInboundMessage,
  checkFreeformWindow,
  updateMessageStatus,
  getContactMessages,
} from '../services/whatsappService';
import {
  initMetaApiService,
  sendTemplateMessage,
  sendFreeformMessage,
  getConnectionStatus,
} from '../services/metaApiService';

interface AuthRequest extends Request {
  user?: { _id: Types.ObjectId; role: string };
}

function handleValidation(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', errors: errors.array() });
    return false;
  }
  return true;
}

export function createWhatsAppRoutes(deps: WhatsAppRouteDeps): Router {
  const router = Router();

  // Initialize services
  initWhatsAppService(deps.MessageModel, deps.ConfigModel);
  initMetaApiService(deps.config);

  // ── GET /webhooks/whatsapp — Meta verification (WHA-INV-08) ───────────

  router.get(
    '/webhooks/whatsapp',
    (req: Request, res: Response): void => {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      if (mode === 'subscribe' && token === deps.config.webhookVerifyToken) {
        res.status(200).send(challenge);
      } else {
        res.status(403).send('Forbidden');
      }
    },
  );

  // ── POST /webhooks/whatsapp — Inbound messages (WHA-INV-08) ───────────

  router.post(
    '/webhooks/whatsapp',
    async (req: Request, res: Response): Promise<void> => {
      // X-Hub-Signature-256 verification
      const signature = req.headers['x-hub-signature-256'] as string;
      if (signature && deps.config.webhookVerifyToken) {
        const expectedSig = 'sha256=' + createHmac('sha256', deps.config.webhookVerifyToken)
          .update(JSON.stringify(req.body))
          .digest('hex');
        if (signature !== expectedSig) {
          res.status(401).send('Invalid signature');
          return;
        }
      }

      // Always respond 200 quickly to Meta
      res.status(200).send('EVENT_RECEIVED');

      // Process webhook payload asynchronously
      try {
        const body = req.body as {
          entry?: Array<{
            changes?: Array<{
              value?: {
                messages?: Array<{
                  id: string;
                  from: string;
                  type: string;
                  text?: { body: string };
                  image?: { id: string; mime_type: string };
                  document?: { id: string; mime_type: string; filename: string };
                }>;
                statuses?: Array<{
                  id: string;
                  status: string;
                  errors?: Array<{ title: string }>;
                }>;
              };
            }>;
          }>;
        };

        for (const entry of body.entry ?? []) {
          for (const change of entry.changes ?? []) {
            const value = change.value;
            if (!value) continue;

            // Process inbound messages
            for (const msg of value.messages ?? []) {
              const mediaId = msg.image?.id || msg.document?.id;
              const logged = await logInboundMessage({
                contactMobile: msg.from,
                contactType: 'unknown',
                waMessageId: msg.id,
                messageType: msg.type as never,
                content: msg.text?.body,
                mediaOriginalUrl: mediaId,
                mediaMimeType: msg.image?.mime_type || msg.document?.mime_type,
              });

              // Kick off async media download — Meta CDN URLs expire quickly.
              if (mediaId && deps.onInboundMedia) {
                try {
                  await deps.onInboundMedia((logged._id as Types.ObjectId).toString());
                } catch {
                  // Enqueue failures must not break webhook processing.
                }
              }
            }

            // Process delivery status updates
            for (const status of value.statuses ?? []) {
              await updateMessageStatus(
                status.id,
                status.status as 'delivered' | 'read' | 'failed',
                status.errors?.[0]?.title,
              );
            }
          }
        }
      } catch {
        // Webhook processing errors should not cause 500 to Meta
      }
    },
  );

  // ── All remaining routes require authentication ───────────────────────

  // ── GET /whatsapp/config ──────────────────────────────────────────────

  router.get(
    '/config',
    deps.authenticate,
    deps.checkPermission('whatsapp', 'admin') as import('express').RequestHandler,
    async (_req: Request, res: Response): Promise<void> => {
      const config = await getConfig();
      res.status(200).json({ status: 200, data: { config } });
    },
  );

  // ── PUT /whatsapp/config ──────────────────────────────────────────────

  router.put(
    '/config',
    deps.authenticate,
    deps.checkPermission('whatsapp', 'admin') as import('express').RequestHandler,
    ...updateConfigValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const user = (req as AuthRequest).user!;

      const config = await updateConfig(req.body);

      await deps.auditLog.log({
        actor: user._id,
        action: 'whatsapp.config.updated',
        resource: 'WhatsAppConfig',
        severity: 'warning',
      });

      res.status(200).json({ status: 200, data: { config } });
    },
  );

  // ── POST /whatsapp/send (WHA-INV-02: template required) ──────────────

  router.post(
    '/send',
    deps.authenticate,
    deps.checkPermission('whatsapp', 'manage') as import('express').RequestHandler,
    ...sendTemplateValidation,
    async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
      if (!handleValidation(req, res)) return;

      const { contactId, contactType, contactMobile, templateName, params } = req.body;

      // WHA-INV-07: DND check
      if (deps.checkDnd) {
        const isDnd = await deps.checkDnd(contactMobile, 'whatsapp');
        if (isDnd) {
          res.status(400).json({
            status: 400,
            code: 'DND_BLOCKED',
            message: 'Contact is on DND list for WhatsApp',
          });
          return;
        }
      }

      try {
        const { waMessageId } = await sendTemplateMessage(
          contactMobile,
          templateName,
          params ?? [],
        );

        const message = await logOutboundMessage({
          contactId,
          contactType,
          contactMobile,
          messageType: 'template',
          templateName,
          templateParams: params,
          waMessageId,
        });

        res.status(200).json({ status: 200, data: { message } });
      } catch (err) {
        res.status(500).json({
          status: 500,
          code: 'SEND_FAILED',
          message: (err as Error).message,
        });
      }
    },
  );

  // ── POST /whatsapp/send-freeform (WHA-INV-03: 24hr window) ───────────

  router.post(
    '/send-freeform',
    deps.authenticate,
    deps.checkPermission('whatsapp', 'manage') as import('express').RequestHandler,
    ...sendFreeformValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;

      const { contactId, contactType, contactMobile, content } = req.body;

      // WHA-INV-03: Check 24hr window
      const window = await checkFreeformWindow(contactMobile);
      if (!window.allowed) {
        res.status(400).json({
          status: 400,
          code: 'WINDOW_EXPIRED',
          message: "Use a template message. Client's last message was over 24 hours ago.",
        });
        return;
      }

      // WHA-INV-07: DND check
      if (deps.checkDnd) {
        const isDnd = await deps.checkDnd(contactMobile, 'whatsapp');
        if (isDnd) {
          res.status(400).json({
            status: 400,
            code: 'DND_BLOCKED',
            message: 'Contact is on DND list for WhatsApp',
          });
          return;
        }
      }

      try {
        const { waMessageId } = await sendFreeformMessage(contactMobile, content);

        const message = await logOutboundMessage({
          contactId,
          contactType,
          contactMobile,
          messageType: 'text',
          content,
          waMessageId,
        });

        res.status(200).json({ status: 200, data: { message } });
      } catch (err) {
        res.status(500).json({
          status: 500,
          code: 'SEND_FAILED',
          message: (err as Error).message,
        });
      }
    },
  );

  // ── GET /whatsapp/status ──────────────────────────────────────────────

  router.get(
    '/status',
    deps.authenticate,
    deps.checkPermission('whatsapp', 'admin') as import('express').RequestHandler,
    async (_req: Request, res: Response): Promise<void> => {
      const status = await getConnectionStatus();
      const config = await getConfig();
      res.status(200).json({
        status: 200,
        data: {
          connected: status.connected,
          qualityRating: config?.qualityRating ?? 'unknown',
          dailyMessageQuota: config?.dailyMessageQuota ?? 0,
        },
      });
    },
  );

  // ── GET /whatsapp/conversations/:contactId ────────────────────────────

  router.get(
    '/conversations/:contactId',
    deps.authenticate,
    deps.checkPermission('whatsapp', 'manage') as import('express').RequestHandler,
    ...getConversationValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const q = req.query as Record<string, string>;

      const result = await getContactMessages(
        req.params.contactId as unknown as Types.ObjectId,
        q.page ? parseInt(q.page, 10) : undefined,
        q.limit ? parseInt(q.limit, 10) : undefined,
      );

      res.status(200).json({ status: 200, data: result });
    },
  );

  return router;
}
