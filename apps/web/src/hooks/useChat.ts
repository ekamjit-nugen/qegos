'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Conversation, ChatMessage } from '@/types/chat';

export function useConversations() {
  return useQuery<Conversation[]>({
    queryKey: ['chat', 'conversations'],
    queryFn: async (): Promise<Conversation[]> => {
      const response = await api.get<{ data: Conversation[] }>('/chat/conversations');
      return response.data.data;
    },
  });
}

export function useConversationMessages(id: string | undefined) {
  return useQuery<ChatMessage[]>({
    queryKey: ['chat', 'messages', id],
    queryFn: async (): Promise<ChatMessage[]> => {
      const response = await api.get<{ data: ChatMessage[] }>(`/chat/conversations/${id}/messages`);
      return response.data.data;
    },
    enabled: !!id,
  });
}

interface SendMessagePayload {
  conversationId: string;
  content: string;
  type?: 'text' | 'file';
  fileUrl?: string;
  fileName?: string;
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation<ChatMessage, Error, SendMessagePayload>({
    mutationFn: async (payload: SendMessagePayload): Promise<ChatMessage> => {
      const response = await api.post<{ data: ChatMessage }>('/chat/messages', payload);
      return response.data.data;
    },
    onSuccess: (_data, variables): void => {
      void queryClient.invalidateQueries({
        queryKey: ['chat', 'messages', variables.conversationId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['chat', 'conversations'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['chat', 'unreadCount'],
      });
    },
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (messageId: string): Promise<void> => {
      await api.patch(`/chat/messages/${messageId}/read`);
    },
    onSuccess: (): void => {
      void queryClient.invalidateQueries({ queryKey: ['chat'] });
    },
  });
}

export function useUnreadCount() {
  return useQuery<{ count: number }>({
    queryKey: ['chat', 'unreadCount'],
    queryFn: async (): Promise<{ count: number }> => {
      const response = await api.get<{ data: { count: number } }>('/chat/unread-count');
      return response.data.data;
    },
  });
}
