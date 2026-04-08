'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Conversation, ConversationListQuery } from '@/types/chat';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

export function useConversationList(filters: ConversationListQuery) {
  return useQuery({
    queryKey: ['conversations', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') { params.set(key, String(value)); }
      }
      const res = await api.get<PaginatedResponse<Conversation>>(`/chat/conversations?${params.toString()}`);
      return res.data;
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
