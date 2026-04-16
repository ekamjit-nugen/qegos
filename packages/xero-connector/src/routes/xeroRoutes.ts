import { randomBytes } from 'crypto';
import { Router, type Request, type Response, type RequestHandler } from 'express';
import { asyncHandler } from '@nugen/error-handler';
import { validate } from '@nugen/validator';
import type { XeroRouteDeps } from '../types';
import { initTokenService, storeTokens, clearTokens } from '../services/tokenService';
import {
  initXeroClient,
  getAuthorizeUrl,
  exchangeCodeForTokens,
  getConnectionStatus,
  getChartOfAccounts,
  getTaxRates,
} from '../services/xeroClient';
import { initContactSync, syncContact, bulkSyncContacts } from '../services/contactSync';
import {
  initInvoiceSync,
  createInvoice,
  voidInvoice,
  adjustInvoice,
  bulkSyncInvoices,
} from '../services/invoiceSync';
import { initPaymentSync, recordPayment } from '../services/paymentSync';
import { initCreditNoteSync, createCreditNote } from '../services/creditNoteSync';
import { initReconciliation, runReconciliation } from '../services/reconciliation';
import {
  initRetrySyncService,
  registerSyncExecutor,
  retrySingleSync,
  retryFailedSyncs,
  flushOfflineQueue,
} from '../services/retrySyncService';
import { xeroWebhookVerify } from '../middleware/xeroWebhookVerify';
import {
  initWebhookHandler,
  processWebhookEvents,
  type XeroWebhookPayload,
} from '../services/webhookHandler';
import {
  validateConfigUpdate,
  validateSyncContact,
  validateOrderId,
  validateSyncLogId,
  validateSyncLogList,
  validateReconciliation,
  validateRecordPayment,
  validateCreditNote,
} from '../validators/xeroValidators';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    userType: number;
    roleId: string;
  };
}

export function createXeroRoutes(deps: XeroRouteDeps): Router {
  const router = Router();
  const {
    XeroConfigModel,
    XeroSyncLogModel,
    OrderModel,
    UserModel,
    PaymentModel,
    redisClient,
    authenticate,
    checkPermission,
    auditLog,
    config,
  } = deps;

  // Initialize all services
  initTokenService(config.encryptionKey, redisClient, XeroConfigModel);
  initXeroClient(config, redisClient, XeroConfigModel);
  initContactSync(XeroSyncLogModel, UserModel);
  initInvoiceSync(XeroSyncLogModel, XeroConfigModel, OrderModel, UserModel);
  initPaymentSync(XeroSyncLogModel, XeroConfigModel, OrderModel, PaymentModel);
  initCreditNoteSync(XeroSyncLogModel, XeroConfigModel, OrderModel);
  initReconciliation(XeroConfigModel, OrderModel, PaymentModel);
  initRetrySyncService(XeroSyncLogModel, XeroConfigModel);

  // Register sync executors for retry service
  registerSyncExecutor('contact', async (entityId) => {
    await syncContact(entityId);
  });
  registerSyncExecutor('invoice', async (entityId) => {
    await createInvoice(entityId);
  });
  registerSyncExecutor('payment', async (entityId) => {
    await recordPayment(entityId);
  });

  // Initialize webhook handler
  initWebhookHandler({
    XeroSyncLogModel,
    XeroConfigModel,
    UserModel: UserModel as never,
    OrderModel: OrderModel as never,
    PaymentModel: PaymentModel as never,
    redisClient,
    auditLog,
  });

  // ─── WEBHOOK: POST /webhooks — Xero real-time event delivery ─────────────
  // Xero sends a POST with HMAC-SHA256 signature in x-xero-signature header.
  // Must respond 200 within 5 seconds. Intent-to-receive (ITR) validation events
  // have an empty events array — respond 200 to confirm key is correct.
  if (config.webhookKey) {
    router.post(
      '/webhooks',
      xeroWebhookVerify(config.webhookKey),
      asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const payload = req.body as XeroWebhookPayload;

        // Intent-to-receive validation: empty events array
        if (!payload.events || payload.events.length === 0) {
          res.status(200).json({ status: 200, data: { message: 'ITR validated' } });
          return;
        }

        // Fire-and-forget: respond 200 immediately, process async
        res.status(200).json({ status: 200, data: { received: true } });

        // Process events in background (after response is sent)
        try {
          const result = await processWebhookEvents(payload);
          if (result.processed > 0) {
            await auditLog.logFromRequest(req, {
              action: 'create',
              resource: 'xero_webhook',
              resourceId: `seq:${payload.firstEventSequence}-${payload.lastEventSequence}`,
              description: `Xero webhook: ${result.processed} processed, ${result.skipped} skipped, ${result.errors} errors`,
              severity: 'low',
            });
          }
        } catch (err: unknown) {
          console.error('[XERO-WEBHOOK] Background processing error:', err); // eslint-disable-line no-console
        }
      }),
    );
  }

  // ─── 1. GET /connect — Initiate OAuth 2.0 flow ───────────────────────────
  router.get(
    '/connect',
    authenticate() as RequestHandler,
    checkPermission('xero_config', 'update') as RequestHandler,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const state = randomBytes(32).toString('hex');
      await redisClient.set(`xero:oauth:state:${state}`, 'valid', 'EX', 600);

      const url = getAuthorizeUrl(state);

      await auditLog.logFromRequest(req, {
        action: 'create',
        resource: 'xero_config',
        resourceId: 'oauth',
        description: 'Xero OAuth authorization initiated',
        severity: 'high',
      });

      res.status(200).json({ status: 200, data: { authorizeUrl: url } });
    }),
  );

  // ─── 2. GET /callback — OAuth callback ────────────────────────────────────
  router.get(
    '/callback',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { code, state } = req.query as { code?: string; state?: string };

      if (!code || !state) {
        res.status(400).json({ status: 400, message: 'Missing code or state parameter' });
        return;
      }

      // Verify state parameter
      const storedState = await redisClient.get(`xero:oauth:state:${state}`);
      if (!storedState) {
        res.status(403).json({ status: 403, message: 'Invalid or expired OAuth state' });
        return;
      }
      await redisClient.del(`xero:oauth:state:${state}`);

      const tokens = await exchangeCodeForTokens(code);
      const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

      await storeTokens(tokens.accessToken, tokens.refreshToken, expiresAt, tokens.tenantId);

      res.status(200).json({
        status: 200,
        data: { connected: true, tenantId: tokens.tenantId },
      });
    }),
  );

  // ─── 3. POST /disconnect — Revoke tokens ─────────────────────────────────
  router.post(
    '/disconnect',
    authenticate() as RequestHandler,
    checkPermission('xero_config', 'update') as RequestHandler,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      await clearTokens();

      await auditLog.logFromRequest(req, {
        action: 'delete',
        resource: 'xero_config',
        resourceId: 'oauth',
        description: 'Xero disconnected — tokens revoked',
        severity: 'critical',
      });

      res.status(200).json({ status: 200, data: { connected: false } });
    }),
  );

  // ─── 4. GET /status — Connection status ───────────────────────────────────
  router.get(
    '/status',
    authenticate() as RequestHandler,
    checkPermission('xero_config', 'read') as RequestHandler,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const status = await getConnectionStatus();
      res.status(200).json({ status: 200, data: status });
    }),
  );

  // ─── 5. GET /config — Account code mappings ──────────────────────────────
  router.get(
    '/config',
    authenticate() as RequestHandler,
    checkPermission('xero_config', 'read') as RequestHandler,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const cfg = await XeroConfigModel.findOne().lean();
      res.status(200).json({
        status: 200,
        data: {
          xeroRevenueAccountCode: cfg?.xeroRevenueAccountCode,
          xeroBankAccountId: cfg?.xeroBankAccountId,
          xeroGstAccountCode: cfg?.xeroGstAccountCode,
          xeroDefaultTaxType: cfg?.xeroDefaultTaxType,
        },
      });
    }),
  );

  // ─── 6. PUT /config — Update account mappings ────────────────────────────
  router.put(
    '/config',
    authenticate() as RequestHandler,
    checkPermission('xero_config', 'update') as RequestHandler,
    ...validate(validateConfigUpdate()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const updates = req.body as Record<string, unknown>;

      const cfg = await XeroConfigModel.findOneAndUpdate(
        {},
        { $set: { ...updates, updatedBy: authReq.user.userId } },
        { new: true, upsert: true },
      ).lean();

      await auditLog.logFromRequest(req, {
        action: 'update',
        resource: 'xero_config',
        resourceId: cfg!._id.toString(),
        description: 'Xero account configuration updated',
        severity: 'high',
      });

      res.status(200).json({ status: 200, data: cfg });
    }),
  );

  // ─── 7. GET /accounts — Chart of Accounts from Xero ─────────────────────
  router.get(
    '/accounts',
    authenticate() as RequestHandler,
    checkPermission('xero_config', 'read') as RequestHandler,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const accounts = await getChartOfAccounts();
      res.status(200).json({ status: 200, data: accounts });
    }),
  );

  // ─── 8. GET /tax-rates — GST/tax rates from Xero ────────────────────────
  router.get(
    '/tax-rates',
    authenticate() as RequestHandler,
    checkPermission('xero_config', 'read') as RequestHandler,
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const rates = await getTaxRates();
      res.status(200).json({ status: 200, data: rates });
    }),
  );

  // ─── 9. POST /sync-contact — Sync single user ───────────────────────────
  router.post(
    '/sync-contact',
    authenticate() as RequestHandler,
    checkPermission('xero_config', 'update') as RequestHandler,
    ...validate(validateSyncContact()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { userId } = req.body as { userId: string };
      const result = await syncContact(userId);

      await auditLog.logFromRequest(req, {
        action: 'create',
        resource: 'xero_contact',
        resourceId: userId,
        description: `Contact synced to Xero: ${result.created ? 'created' : 'matched existing'}`,
        severity: 'low',
      });

      res.status(200).json({ status: 200, data: result });
    }),
  );

  // ─── 10. POST /sync-contacts — Bulk sync all unsynced users ──────────────
  router.post(
    '/sync-contacts',
    authenticate() as RequestHandler,
    checkPermission('xero_config', 'update') as RequestHandler,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const result = await bulkSyncContacts();

      await auditLog.logFromRequest(req, {
        action: 'create',
        resource: 'xero_contact',
        resourceId: 'bulk',
        description: `Bulk contact sync: ${result.synced} synced, ${result.failed} failed`,
        severity: 'medium',
      });

      res.status(200).json({ status: 200, data: result });
    }),
  );

  // ─── 11. POST /create-invoice — Create Xero invoice from order ───────────
  router.post(
    '/create-invoice',
    authenticate() as RequestHandler,
    ...validate(
      validateOrderId().map((c) => {
        // Remap param to body for this endpoint
        return c;
      }),
    ),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { orderId } = req.body as { orderId: string };
      const result = await createInvoice(orderId);

      await auditLog.logFromRequest(req, {
        action: 'create',
        resource: 'xero_invoice',
        resourceId: orderId,
        description: `Invoice created in Xero: ${result.xeroInvoiceNumber}`,
        severity: 'medium',
      });

      res.status(201).json({ status: 201, data: result });
    }),
  );

  // ─── 12. PUT /update-invoice/:orderId — Update invoice ───────────────────
  router.put(
    '/update-invoice/:orderId',
    authenticate() as RequestHandler,
    checkPermission('xero_config', 'update') as RequestHandler,
    ...validate(validateOrderId()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const result = await adjustInvoice(req.params.orderId);

      await auditLog.logFromRequest(req, {
        action: 'update',
        resource: 'xero_invoice',
        resourceId: req.params.orderId,
        description: `Invoice adjusted in Xero (void + recreate): ${result.xeroInvoiceNumber}`,
        severity: 'critical',
      });

      res.status(200).json({ status: 200, data: result });
    }),
  );

  // ─── 13. POST /void-invoice/:orderId — Void invoice (XRO-INV-08) ────────
  router.post(
    '/void-invoice/:orderId',
    authenticate() as RequestHandler,
    checkPermission('xero_config', 'update') as RequestHandler,
    ...validate(validateOrderId()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const adminOverride = (req.body as { adminOverride?: boolean }).adminOverride ?? false;
      await voidInvoice(req.params.orderId, adminOverride);

      await auditLog.logFromRequest(req, {
        action: 'void',
        resource: 'xero_invoice',
        resourceId: req.params.orderId,
        description: `Invoice voided in Xero${adminOverride ? ' (admin override)' : ''}`,
        severity: 'critical',
      });

      res.status(200).json({ status: 200, data: { voided: true } });
    }),
  );

  // ─── 14. POST /bulk-sync-invoices — Sync all missing invoices ────────────
  router.post(
    '/bulk-sync-invoices',
    authenticate() as RequestHandler,
    checkPermission('xero_config', 'update') as RequestHandler,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const result = await bulkSyncInvoices();

      await auditLog.logFromRequest(req, {
        action: 'create',
        resource: 'xero_invoice',
        resourceId: 'bulk',
        description: `Bulk invoice sync: ${result.synced} synced, ${result.failed} failed`,
        severity: 'medium',
      });

      res.status(200).json({ status: 200, data: result });
    }),
  );

  // ─── 15. POST /record-payment — Record payment in Xero ──────────────────
  router.post(
    '/record-payment',
    authenticate() as RequestHandler,
    ...validate(validateRecordPayment()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { paymentId } = req.body as { paymentId: string };
      const result = await recordPayment(paymentId);

      await auditLog.logFromRequest(req, {
        action: 'create',
        resource: 'xero_payment',
        resourceId: paymentId,
        description: `Payment recorded in Xero: ${result.xeroPaymentId}`,
        severity: 'medium',
      });

      res.status(201).json({ status: 201, data: result });
    }),
  );

  // ─── 16. POST /create-credit-note — Credit note for refund ───────────────
  router.post(
    '/create-credit-note',
    authenticate() as RequestHandler,
    ...validate(validateCreditNote()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { orderId, refundAmountCents, reference } = req.body as {
        orderId: string;
        refundAmountCents: number;
        reference: string;
      };

      const result = await createCreditNote(orderId, refundAmountCents, reference);

      await auditLog.logFromRequest(req, {
        action: 'create',
        resource: 'xero_credit_note',
        resourceId: orderId,
        description: `Credit note created: ${refundAmountCents} cents for order ${orderId}`,
        severity: 'high',
      });

      res.status(201).json({ status: 201, data: result });
    }),
  );

  // ─── 17. GET /sync-logs — Sync history ───────────────────────────────────
  router.get(
    '/sync-logs',
    authenticate() as RequestHandler,
    checkPermission('xero_config', 'read') as RequestHandler,
    ...validate(validateSyncLogList()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const {
        page = 1,
        limit = 20,
        entityType,
        status,
        dateFrom,
        dateTo,
      } = req.query as {
        page?: number;
        limit?: number;
        entityType?: string;
        status?: string;
        dateFrom?: string;
        dateTo?: string;
      };

      const filter: Record<string, unknown> = {};
      if (entityType) {
        filter.entityType = entityType;
      }
      if (status) {
        filter.status = status;
      }
      if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) {
          (filter.createdAt as Record<string, Date>).$gte = new Date(dateFrom);
        }
        if (dateTo) {
          (filter.createdAt as Record<string, Date>).$lte = new Date(dateTo);
        }
      }

      const pageNum = Number(page);
      const limitNum = Number(limit);
      const skip = (pageNum - 1) * limitNum;

      const [logs, total] = await Promise.all([
        XeroSyncLogModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
        XeroSyncLogModel.countDocuments(filter),
      ]);

      res.status(200).json({
        status: 200,
        data: logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasNext: pageNum * limitNum < total,
          hasPrev: pageNum > 1,
        },
      });
    }),
  );

  // ─── 18. POST /reconciliation — Compare QEGOS vs Xero (XRO-INV-09) ─────
  router.post(
    '/reconciliation',
    authenticate() as RequestHandler,
    checkPermission('xero_config', 'read') as RequestHandler,
    ...validate(validateReconciliation()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { dateFrom, dateTo } = req.body as { dateFrom?: string; dateTo?: string };

      const result = await runReconciliation(
        dateFrom ? new Date(dateFrom) : undefined,
        dateTo ? new Date(dateTo) : undefined,
      );

      await auditLog.logFromRequest(req, {
        action: 'read',
        resource: 'xero_reconciliation',
        resourceId: 'report',
        description: `Reconciliation: ${result.matched} matched, ${result.mismatched.length} mismatched`,
        severity: 'medium',
      });

      res.status(200).json({ status: 200, data: result });
    }),
  );

  // ─── 19. POST /retry/:syncLogId — Manual retry ──────────────────────────
  router.post(
    '/retry/:syncLogId',
    authenticate() as RequestHandler,
    checkPermission('xero_config', 'update') as RequestHandler,
    ...validate(validateSyncLogId()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const success = await retrySingleSync(req.params.syncLogId);

      await auditLog.logFromRequest(req, {
        action: 'update',
        resource: 'xero_sync_log',
        resourceId: req.params.syncLogId,
        description: `Manual sync retry: ${success ? 'success' : 'failed'}`,
        severity: 'medium',
      });

      res.status(200).json({ status: 200, data: { success } });
    }),
  );

  return router;
}

// ─── Cron Exports ───────────────────────────────────────────────────────────

export { retryFailedSyncs, flushOfflineQueue };
