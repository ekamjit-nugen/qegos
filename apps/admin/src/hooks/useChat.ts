'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Conversation, ConversationListQuery } from '@/types/chat';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: ['conversations', id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Conversation>>(`/chat/conversations/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useConversationList(filters: ConversationListQuery) {
  return useQuery({
    queryKey: ['conversations', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') {
          params.set(key, String(value));
        }
      }
      const res = await api.get<{
        status: number;
        data: { conversations: Conversation[]; total: number };
      }>(`/chat/conversations?${params.toString()}`);
      const { conversations, total } = res.data.data;
      // Normalize to PaginatedResponse shape expected by the table
      return {
        status: res.data.status,
        data: conversations,
        meta: {
          page: filters.page ?? 1,
          limit: filters.limit ?? 20,
          total,
          totalPages: Math.ceil(total / (filters.limit ?? 20)),
        },
      } as PaginatedResponse<Conversation>;
    },
    placeholderData: (prev) => prev,
  });
}

export function useConversationMessages(id: string | undefined) {
  return useQuery({
    queryKey: ['conversations', id, 'messages'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<unknown[]>>(`/chat/conversations/${id}/messages`);
      return res.data.data;
    },
    enabled: !!id,
  });
}
