import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type {
  Conversation,
  ChatMessage,
  SendMessageRequest,
  UnreadCount,
} from '@/types/chat';

export function useConversations(): ReturnType<
  typeof useQuery<PaginatedResponse<Conversation>>
> {
  return useQuery<PaginatedResponse<Conversation>>({
    queryKey: ['conversations'],
    queryFn: async (): Promise<PaginatedResponse<Conversation>> => {
      const res = await api.get<PaginatedResponse<Conversation>>(
        '/chat/conversations',
      );
      return res.data;
    },
  });
}

export function useConversationMessages(
  conversationId: string | undefined,
  page: number = 1,
): ReturnType<typeof useQuery<PaginatedResponse<ChatMessage>>> {
  return useQuery<PaginatedResponse<ChatMessage>>({
    queryKey: ['conversation-messages', conversationId, page],
    queryFn: async (): Promise<PaginatedResponse<ChatMessage>> => {
      const res = await api.get<PaginatedResponse<ChatMessage>>(
        `/chat/conversations/${conversationId}/messages`,
        { params: { page } },
      );
      return res.data;
    },
    enabled: !!conversationId,
  });
}

export function useSendMessage(): ReturnType<
  typeof useMutation<ApiResponse<ChatMessage>, Error, SendMessageRequest>
> {
  const queryClient = useQueryClient();

  return useMutation<ApiResponse<ChatMessage>, Error, SendMessageRequest>({
    mutationFn: async (
      data: SendMessageRequest,
    ): Promise<ApiResponse<ChatMessage>> => {
      const res = await api.post<ApiResponse<ChatMessage>>(
        '/chat/messages',
        data,
      );
      return res.data;
    },
    onSuccess: async (
      _data: ApiResponse<ChatMessage>,
      variables: SendMessageRequest,
    ): Promise<void> => {
      await queryClient.invalidateQueries({
        queryKey: ['conversation-messages', variables.conversationId],
      });
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      await queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });
}

export function useUnreadCount(): ReturnType<
  typeof useQuery<ApiResponse<UnreadCount>>
> {
  return useQuery<ApiResponse<UnreadCount>>({
    queryKey: ['unread-count'],
    queryFn: async (): Promise<ApiResponse<UnreadCount>> => {
      const res = await api.get<ApiResponse<UnreadCount>>(
        '/chat/unread-count',
      );
      return res.data;
    },
    refetchInterval: 30_000,
  });
}
