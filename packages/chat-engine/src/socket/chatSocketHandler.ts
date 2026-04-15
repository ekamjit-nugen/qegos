import type { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  IChatMessage,
} from '../types';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ChatSocketConfig {
  /** Cors origins for Socket.io */
  corsOrigins: string | string[];
  /** JWT verification function: returns { userId, userType } or throws */
  verifyToken: (token: string) => Promise<{ userId: string; userType: string }>;
}

interface SocketData {
  userId: string;
  userType: string;
}

export type ChatSocketServer = SocketServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

// ─── Module State ──────────────────────────────────────────────────────────

let io: ChatSocketServer | null = null;

// ─── Init ──────────────────────────────────────────────────────────────────

/**
 * Attach Socket.io to an HTTP server for real-time chat.
 * Authenticates via JWT in `auth.token` handshake query or `Authorization` header.
 */
export function initChatSocket(
  httpServer: HttpServer,
  config: ChatSocketConfig,
): ChatSocketServer {
  io = new SocketServer<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, {
    path: '/socket.io',
    cors: {
      origin: config.corsOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // ── Authentication middleware ───────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth as Record<string, string>).token ??
        socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const user = await config.verifyToken(token);
      socket.data.userId = user.userId;
      socket.data.userType = user.userType;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  // ── Connection handler ─────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const { userId, userType } = socket.data;

    // Auto-join user's personal room for direct notifications
    void socket.join(`user:${userId}`);

    // Staff get presence broadcast
    if (userType !== 'client' && userType !== 'student') {
      io!.emit('staff_presence', { staffId: userId, online: true });
    }

    // ── Join conversation room ─────────────────────────────────────────
    socket.on('join_conversation', ({ conversationId }) => {
      void socket.join(`conversation:${conversationId}`);
    });

    // ── Leave conversation room ────────────────────────────────────────
    socket.on('leave_conversation', ({ conversationId }) => {
      void socket.leave(`conversation:${conversationId}`);
    });

    // ── Typing indicator ───────────────────────────────────────────────
    socket.on('typing_indicator', ({ conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit('typing_indicator', {
        conversationId,
        userId,
        isTyping: true,
      });

      // Auto-clear typing after 3 seconds
      setTimeout(() => {
        socket.to(`conversation:${conversationId}`).emit('typing_indicator', {
          conversationId,
          userId,
          isTyping: false,
        });
      }, 3000);
    });

    // ── Disconnect ─────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      if (userType !== 'client' && userType !== 'student') {
        io!.emit('staff_presence', { staffId: userId, online: false });
      }
    });
  });

  return io;
}

// ─── Emit Helpers (called from REST routes / services) ─────────────────────

/**
 * Broadcast a new message to all participants in a conversation.
 */
export function emitNewMessage(
  conversationId: string,
  message: IChatMessage,
): void {
  if (!io) { return; }
  io.to(`conversation:${conversationId}`).emit('new_message', {
    conversationId,
    message,
  });
}

/**
 * Notify that a message has been read.
 */
export function emitMessageRead(
  conversationId: string,
  messageId: string,
  readAt: Date,
): void {
  if (!io) { return; }
  io.to(`conversation:${conversationId}`).emit('message_read', {
    conversationId,
    messageId,
    readAt,
  });
}

/**
 * Notify that a conversation was resolved.
 */
export function emitConversationResolved(conversationId: string): void {
  if (!io) { return; }
  io.to(`conversation:${conversationId}`).emit('conversation_resolved', {
    conversationId,
  });
}

/**
 * Get the Socket.io server instance (null if not initialized).
 */
export function getSocketServer(): ChatSocketServer | null {
  return io;
}

/**
 * True iff at least one live socket is joined to the user's personal room
 * (`user:{userId}`). Used by REST routes to decide whether to fall back to
 * push notification delivery. Returns `false` if Socket.io isn't initialized
 * (e.g. in tests) — callers should treat that as "offline, please notify".
 */
export async function isUserOnline(userId: string): Promise<boolean> {
  if (!io) return false;
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  return sockets.length > 0;
}
