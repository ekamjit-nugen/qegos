'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { getAccessToken } from '@/lib/api/tokenStorage';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:5000';

/** Socket.io event payloads matching server-side types */
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

interface MessageReadPayload {
  conversationId: string;
  messageId: string;
  readAt: string;
}

interface TypingPayload {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

let socketInstance: Socket | null = null;

/**
 * Returns the singleton Socket.io client, connecting on first call.
 * Authenticates using the current access token.
 */
function getSocket(): Socket | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (socketInstance?.connected) {
    return socketInstance;
  }

  const token = getAccessToken();
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
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  return socketInstance;
}

/**
 * Disconnect and destroy the socket singleton (e.g. on logout).
 */
export function disconnectSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}

/**
 * Hook that connects to Socket.io and invalidates React Query caches
 * when real-time chat events arrive.
 *
 * @param activeConversationId - The currently viewed conversation (optional).
 * @param onTyping - Callback for typing indicators.
 */
export function useChatSocket(
  activeConversationId?: string,
  onTyping?: (payload: TypingPayload) => void,
): {
  joinConversation: (id: string) => void;
  leaveConversation: (id: string) => void;
  sendTyping: (conversationId: string) => void;
  isConnected: boolean;
} {
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const joinedRef = useRef<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) {
      return;
    }
    socketRef.current = socket;

    const handleNewMessage = (payload: NewMessagePayload): void => {
      // Refresh the conversation's messages
      void qc.invalidateQueries({
        queryKey: ['portal', 'conversations', payload.conversationId, 'messages'],
      });
      // Refresh conversation list (unread counts, last message)
      void qc.invalidateQueries({ queryKey: ['portal', 'conversations'] });
    };

    const handleMessageRead = (_payload: MessageReadPayload): void => {
      void qc.invalidateQueries({ queryKey: ['portal', 'conversations'] });
    };

    const handleConversationResolved = (payload: { conversationId: string }): void => {
      void qc.invalidateQueries({
        queryKey: ['portal', 'conversations', payload.conversationId],
      });
      void qc.invalidateQueries({ queryKey: ['portal', 'conversations'] });
    };

    const handleTyping = (payload: TypingPayload): void => {
      onTyping?.(payload);
    };

    socket.on('new_message', handleNewMessage);
    socket.on('message_read', handleMessageRead);
    socket.on('conversation_resolved', handleConversationResolved);
    socket.on('typing_indicator', handleTyping);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('message_read', handleMessageRead);
      socket.off('conversation_resolved', handleConversationResolved);
      socket.off('typing_indicator', handleTyping);
    };
  }, [qc, onTyping]);

  // Auto-join/leave conversation room when activeConversationId changes
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }

    if (joinedRef.current && joinedRef.current !== activeConversationId) {
      socket.emit('leave_conversation', { conversationId: joinedRef.current });
      joinedRef.current = null;
    }

    if (activeConversationId) {
      socket.emit('join_conversation', { conversationId: activeConversationId });
      joinedRef.current = activeConversationId;
    }

    return () => {
      if (joinedRef.current) {
        socket.emit('leave_conversation', { conversationId: joinedRef.current });
        joinedRef.current = null;
      }
    };
  }, [activeConversationId]);

  const joinConversation = useCallback((id: string) => {
    socketRef.current?.emit('join_conversation', { conversationId: id });
  }, []);

  const leaveConversation = useCallback((id: string) => {
    socketRef.current?.emit('leave_conversation', { conversationId: id });
  }, []);

  const sendTyping = useCallback((conversationId: string) => {
    socketRef.current?.emit('typing_indicator', { conversationId });
  }, []);

  return {
    joinConversation,
    leaveConversation,
    sendTyping,
    isConnected: socketRef.current?.connected ?? false,
  };
}
