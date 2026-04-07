import { Router, type Request, type Response, type NextFunction } from 'express';
import { validationResult } from 'express-validator';
import type { Types } from 'mongoose';
import type { ChatEngineRouteDeps } from '../types';
import {
  createConversationValidation,
  getConversationValidation,
  listConversationsValidation,
  sendMessageValidation,
  markReadValidation,
  resolveConversationValidation,
  transferConversationValidation,
  createCannedResponseValidation,
  searchMessagesValidation,
} from '../validators/chatValidators';
import {
  initChatService,
  findOrCreateConversation,
  getConversation,
  listConversations,
  resolveConversation,
  transferConversation,
  sendMessage,
  getMessages,
  markMessageRead,
  getUnreadCount,
  listCannedResponses,
  createCannedResponse,
} from '../services/chatService';
import { initTfnRedaction } from '../services/tfnRedaction';

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

export function createChatRoutes(deps: ChatEngineRouteDeps): Router {
  const router = Router();

  // Initialize
  initChatService(deps.ConversationModel, deps.MessageModel, deps.CannedResponseModel);
  initTfnRedaction(deps.config.encryptionKey);

  router.use(deps.authenticate);

  // ── POST /chat/conversations ──────────────────────────────────────────

  router.post(
    '/conversations',
    ...createConversationValidation,
    async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const user = (req as AuthRequest).user!;

      const conv = await findOrCreateConversation(
        user._id,
        req.body.staffId as unknown as Types.ObjectId | undefined,
        req.body.orderId as unknown as Types.ObjectId | undefined,
        req.body.subject,
      );

      res.status(200).json({ status: 200, data: { conversation: conv } });
    },
  );

  // ── GET /chat/conversations ───────────────────────────────────────────

  router.get(
    '/conversations',
    ...listConversationsValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const user = (req as AuthRequest).user!;
      const q = req.query as Record<string, string>;

      const filters: Record<string, unknown> = {};
      if (user.role === 'client') {
        filters.userId = user._id;
      } else if (user.role !== 'admin' && user.role !== 'super_admin') {
        filters.staffId = user._id;
      }
      if (q.status) filters.status = q.status;

      const result = await listConversations(
        filters as never,
        q.page ? parseInt(q.page, 10) : undefined,
        q.limit ? parseInt(q.limit, 10) : undefined,
      );

      res.status(200).json({ status: 200, data: result });
    },
  );

  // ── GET /chat/conversations/:id/messages ──────────────────────────────

  router.get(
    '/conversations/:id/messages',
    ...getConversationValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const q = req.query as Record<string, string>;

      const result = await getMessages(
        req.params.id as unknown as Types.ObjectId,
        q.page ? parseInt(q.page, 10) : undefined,
        q.limit ? parseInt(q.limit, 10) : undefined,
      );

      res.status(200).json({ status: 200, data: result });
    },
  );

  // ── POST /chat/messages ───────────────────────────────────────────────

  router.post(
    '/messages',
    ...sendMessageValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const user = (req as AuthRequest).user!;

      const message = await sendMessage({
        conversationId: req.body.conversationId as unknown as Types.ObjectId,
        senderId: user._id,
        senderType: user.role === 'client' ? 'client' : 'staff',
        type: req.body.type,
        content: req.body.content,
        fileUrl: req.body.fileUrl,
        fileName: req.body.fileName,
        fileSize: req.body.fileSize,
        mimeType: req.body.mimeType,
      });

      res.status(201).json({ status: 201, data: { message } });
    },
  );

  // ── PATCH /chat/messages/:id/read ─────────────────────────────────────

  router.patch(
    '/messages/:id/read',
    ...markReadValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;

      const message = await markMessageRead(req.params.id as unknown as Types.ObjectId);
      if (!message) {
        res.status(404).json({ status: 404, code: 'NOT_FOUND' });
        return;
      }

      res.status(200).json({ status: 200, data: { message } });
    },
  );

  // ── PATCH /chat/conversations/:id/resolve ─────────────────────────────

  router.patch(
    '/conversations/:id/resolve',
    deps.checkPermission('chat', 'manage') as import('express').RequestHandler,
    ...resolveConversationValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;

      const conv = await resolveConversation(req.params.id as unknown as Types.ObjectId);
      if (!conv) {
        res.status(404).json({ status: 404, code: 'NOT_FOUND' });
        return;
      }

      res.status(200).json({ status: 200, data: { conversation: conv } });
    },
  );

  // ── PATCH /chat/conversations/:id/transfer (CHT-INV-07) ──────────────

  router.patch(
    '/conversations/:id/transfer',
    deps.checkPermission('chat', 'admin') as import('express').RequestHandler,
    ...transferConversationValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const user = (req as AuthRequest).user!;

      const conv = await transferConversation(
        req.params.id as unknown as Types.ObjectId,
        req.body.newStaffId as unknown as Types.ObjectId,
        req.body.newStaffName,
      );

      if (!conv) {
        res.status(404).json({ status: 404, code: 'NOT_FOUND' });
        return;
      }

      await deps.auditLog.log({
        actor: user._id,
        action: 'chat.conversation.transferred',
        resource: 'ChatConversation',
        resourceId: conv._id,
        severity: 'info',
        metadata: { newStaffId: req.body.newStaffId },
      });

      res.status(200).json({ status: 200, data: { conversation: conv } });
    },
  );

  // ── GET /chat/unread-count ────────────────────────────────────────────

  router.get(
    '/unread-count',
    async (req: Request, res: Response): Promise<void> => {
      const user = (req as AuthRequest).user!;
      const count = await getUnreadCount(user._id, user.role);
      res.status(200).json({ status: 200, data: { unreadCount: count } });
    },
  );

  // ── GET /chat/canned-responses ────────────────────────────────────────

  router.get(
    '/canned-responses',
    deps.checkPermission('chat', 'manage') as import('express').RequestHandler,
    async (req: Request, res: Response): Promise<void> => {
      const user = (req as AuthRequest).user!;
      const q = req.query as Record<string, string>;

      const responses = await listCannedResponses(
        user._id,
        q.category as never,
      );

      res.status(200).json({ status: 200, data: { responses } });
    },
  );

  // ── POST /chat/canned-responses ───────────────────────────────────────

  router.post(
    '/canned-responses',
    deps.checkPermission('chat', 'manage') as import('express').RequestHandler,
    ...createCannedResponseValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;
      const user = (req as AuthRequest).user!;

      const response = await createCannedResponse({
        ...req.body,
        createdBy: user._id,
      });

      res.status(201).json({ status: 201, data: { response } });
    },
  );

  // ── POST /chat/search (admin+) ────────────────────────────────────────

  router.post(
    '/search',
    deps.checkPermission('chat', 'admin') as import('express').RequestHandler,
    ...searchMessagesValidation,
    async (req: Request, res: Response): Promise<void> => {
      if (!handleValidation(req, res)) return;

      const { query: searchQuery, page = 1, limit = 20 } = req.body;
      const messages = await deps.MessageModel.find(
        { $text: { $search: searchQuery } },
        { score: { $meta: 'textScore' } },
      )
        .sort({ score: { $meta: 'textScore' } })
        .skip((page - 1) * limit)
        .limit(limit);

      res.status(200).json({ status: 200, data: { messages } });
    },
  );

  return router;
}
