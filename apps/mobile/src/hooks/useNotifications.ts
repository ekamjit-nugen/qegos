import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { Notification } from '@/types/notification';

export function useNotifications(
  page: number = 1,
  limit: number = 20,
): ReturnType<typeof useQuery<PaginatedResponse<Notification>>> {
  return useQuery<PaginatedResponse<Notification>>({
    queryKey: ['notifications', page, limit],
    queryFn: async (): Promise<PaginatedResponse<Notification>> => {
      const res = await api.get<PaginatedResponse<Notification>>('/notifications', {
        params: { page, limit },
      });
      return res.data;
    },
  });
}

export function useUnreadNotificationCount(): ReturnType<
  typeof useQuery<ApiResponse<{ count: number }>>
> {
  return useQuery<ApiResponse<{ count: number }>>({
    queryKey: ['notifications-unread-count'],
    queryFn: async (): Promise<ApiResponse<{ count: number }>> => {
      const res = await api.get<ApiResponse<{ count: number }>>('/notifications/unread-count');
      return res.data;
    },
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead(): ReturnType<
  typeof useMutation<ApiResponse<Notification>, Error, string>
> {
  const queryClient = useQueryClient();

  return useMutation<ApiResponse<Notification>, Error, string>({
    mutationFn: async (notificationId: string): Promise<ApiResponse<Notification>> => {
      const res = await api.patch<ApiResponse<Notification>>(
        `/notifications/${notificationId}/read`,
      );
      return res.data;
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      await queryClient.invalidateQueries({
        queryKey: ['notifications-unread-count'],
      });
    },
  });
}

export function useMarkAllRead(): ReturnType<
  typeof useMutation<ApiResponse<{ updated: number }>, Error, void>
> {
  const queryClient = useQueryClient();

  return useMutation<ApiResponse<{ updated: number }>, Error, void>({
    mutationFn: async (): Promise<ApiResponse<{ updated: number }>> => {
      const res = await api.patch<ApiResponse<{ updated: number }>>('/notifications/read-all');
      return res.data;
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      await queryClient.invalidateQueries({
        queryKey: ['notifications-unread-count'],
      });
    },
  });
}
