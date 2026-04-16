import { useEffect, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { getAccessToken } from '@/lib/api/tokenStorage';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? 'http://localhost:5000';

interface NewMessagePayload {
  conversationId: string;
  message: {
    _id: string;
    conversationId: string;
    senderId: string;
    senderType: 'client' | 'staff' | 'system';
    content: string;
    createdAt: string;
  };
}

interface TypingPayload {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

let socketInstance: Socket | null = null;

async function getSocket(): Promise<Socket | null> {
  if (socketInstance?.connected) {
    return socketInstance;
  }

  const token = await getAccessToken();
  if (!token) {
    return null;
  }

  if (socketInstance) {
    socketInstance.auth = { token };
    socketInstance.connect();
    return socketInstance;
  }

  socketInstance = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  return socketInstance;
}

export function disconnectSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}

/**
 * Mobile chat socket hook — connects to Socket.io and invalidates
 * React Query caches on real-time events.
 * Uses async token access (Expo SecureStore).
 */
export function useChatSocket(
  activeConversationId?: string,
  onTyping?: (payload: TypingPayload) => void,
): {
  sendTyping: (conversationId: string) => void;
  isConnected: boolean;
} {
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const joinedRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    void getSocket().then((socket) => {
      if (!mounted || !socket) {
        return;
      }
      socketRef.current = socket;

      const handleNewMessage = (payload: NewMessagePayload): void => {
        void qc.invalidateQueries({
          queryKey: ['conversation-messages', payload.conversationId],
        });
        void qc.invalidateQueries({ queryKey: ['conversations'] });
        void qc.invalidateQueries({ queryKey: ['unread-count'] });
      };

      const handleTyping = (payload: TypingPayload): void => {
        onTyping?.(payload);
      };

      const handleResolved = (payload: { conversationId: string }): void => {
        void qc.invalidateQueries({ queryKey: ['conversations'] });
        void qc.invalidateQueries({
          queryKey: ['conversation-messages', payload.conversationId],
        });
      };

      socket.on('new_message', handleNewMessage);
      socket.on('typing_indicator', handleTyping);
      socket.on('conversation_resolved', handleResolved);

      // Join active conversation if set
      if (activeConversationId) {
        socket.emit('join_conversation', { conversationId: activeConversationId });
        joinedRef.current = activeConversationId;
      }
    });

    return () => {
      mounted = false;
      const socket = socketRef.current;
      if (socket) {
        socket.off('new_message');
        socket.off('typing_indicator');
        socket.off('conversation_resolved');
        if (joinedRef.current) {
          socket.emit('leave_conversation', { conversationId: joinedRef.current });
          joinedRef.current = null;
        }
      }
    };
  }, [qc, activeConversationId, onTyping]);

  const sendTyping = useCallback((conversationId: string) => {
    socketRef.current?.emit('typing_indicator', { conversationId });
  }, []);

  return {
    sendTyping,
    isConnected: socketRef.current?.connected ?? false,
  };
}
