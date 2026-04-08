'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { getAccessToken } from '@/lib/api/tokenStorage';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:5000';

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

interface StaffPresencePayload {
  staffId: string;
  online: boolean;
}

let socketInstance: Socket | null = null;

function getSocket(): Socket | null {
  if (typeof window === 'undefined') { return null; }

  if (socketInstance?.connected) { return socketInstance; }

  const token = getAccessToken();
  if (!token) { return null; }

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

export function disconnectSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}

/**
 * Admin chat socket hook — listens for real-time events and invalidates
 * React Query caches. Also surfaces typing indicators and staff presence.
 */
export function useChatSocket(
  activeConversationId?: string,
  callbacks?: {
    onTyping?: (payload: TypingPayload) => void;
    onStaffPresence?: (payload: StaffPresencePayload) => void;
  },
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
    if (!socket) { return; }
    socketRef.current = socket;

    const handleNewMessage = (payload: NewMessagePayload): void => {
      void qc.invalidateQueries({
        queryKey: ['conversations', payload.conversationId, 'messages'],
      });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    };

    const handleTyping = (payload: TypingPayload): void => {
      callbacks?.onTyping?.(payload);
    };

    const handlePresence = (payload: StaffPresencePayload): void => {
      callbacks?.onStaffPresence?.(payload);
    };

    const handleConversationResolved = (payload: { conversationId: string }): void => {
      void qc.invalidateQueries({ queryKey: ['conversations', payload.conversationId] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    };

    socket.on('new_message', handleNewMessage);
    socket.on('typing_indicator', handleTyping);
    socket.on('staff_presence', handlePresence);
    socket.on('conversation_resolved', handleConversationResolved);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('typing_indicator', handleTyping);
      socket.off('staff_presence', handlePresence);
      socket.off('conversation_resolved', handleConversationResolved);
    };
  }, [qc, callbacks]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) { return; }

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
