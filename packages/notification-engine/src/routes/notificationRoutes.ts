import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '@nugen/error-handler';
import { validate } from '@nugen/validator';
import type { NotificationRouteDeps, SendNotificationParams } from '../types';
import {
  send,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  listNotifications,
} from '../services/notificationService';
import {
  getPreferences,
  upsertPreferences,
} from '../services/preferenceService';
import {
  validateListNotifications,
  validateMarkRead,
  validateUpdatePreferences,
  validateSendNotification,
} from '../validators/notificationValidators';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    userType: number;
    roleId: string;
  };
}

export function createNotificationRoutes(deps: NotificationRouteDeps): Router {
  const router = Router();
  const { authenticate, checkPermission, auditLog } = deps;

  // All routes require authentication
  router.use(authenticate());

  // ─── 1. GET / — List notifications for current user ───────────────────────
  router.get(
    '/',
    ...validate(validateListNotifications()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { userId } = (req as AuthenticatedRequest).user;
      const { isRead, type, page, limit } = req.query as Record<string, string>;

      const result = await listNotifications(userId, {
        isRead: isRead !== undefined ? isRead === 'true' : undefined,
        type,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      });

      res.status(200).json({
        status: 200,
        data: result,
      });
    }),
  );

  // ─── 2. GET /unread-count — Badge count ───────────────────────────────────
  router.get(
    '/unread-count',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { userId } = (req as AuthenticatedRequest).user;
      const count = await getUnreadCount(userId);

      res.status(200).json({
        status: 200,
        data: { unreadCount: count },
      });
    }),
  );

  // ─── 3. GET /preferences — Get notification preferences ───────────────────
  router.get(
    '/preferences',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { userId } = (req as AuthenticatedRequest).user;
      const prefs = await getPreferences(userId);

      res.status(200).json({
        status: 200,
        data: prefs ?? { message: 'No preferences set, defaults apply' },
      });
    }),
  );

  // ─── 4. PUT /preferences — Update notification preferences ────────────────
  router.put(
    '/preferences',
    ...validate(validateUpdatePreferences()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { userId } = (req as AuthenticatedRequest).user;
      const updated = await upsertPreferences(userId, req.body as Record<string, unknown>);

      if (auditLog?.logFromRequest) {
        await auditLog.logFromRequest(req, {
          action: 'notification_preferences_updated',
          resource: 'notification_preference',
          resourceId: updated._id?.toString(),
        });
      }

      res.status(200).json({
        status: 200,
        data: updated,
      });
    }),
  );

  // ─── 5. PATCH /read-all — Mark all as read ────────────────────────────────
  router.patch(
    '/read-all',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { userId } = (req as AuthenticatedRequest).user;
      const count = await markAllAsRead(userId);

      res.status(200).json({
        status: 200,
        data: { markedRead: count },
      });
    }),
  );

  // ─── 6. POST /send — Admin manual send ────────────────────────────────────
  router.post(
    '/send',
    checkPermission('notifications', 'create'),
    ...validate(validateSendNotification()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const params = req.body as SendNotificationParams;
      const result = await send(params);

      if (auditLog?.logFromRequest) {
        await auditLog.logFromRequest(req, {
          action: 'notification_sent',
          resource: 'notification',
          resourceId: result.notification._id?.toString(),
          details: { type: params.type, channels: params.channels },
        });
      }

      res.status(201).json({
        status: 201,
        data: result,
      });
    }),
  );

  // ─── 7. PATCH /:id/read — Mark single as read ────────────────────────────
  router.patch(
    '/:id/read',
    ...validate(validateMarkRead()),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { userId } = (req as AuthenticatedRequest).user;
      const notification = await markAsRead(req.params.id, userId);

      if (!notification) {
        res.status(404).json({
          status: 404,
          code: 'NOT_FOUND',
          message: 'Notification not found',
        });
        return;
      }

      res.status(200).json({
        status: 200,
        data: notification,
      });
    }),
  );

  return router;
}
