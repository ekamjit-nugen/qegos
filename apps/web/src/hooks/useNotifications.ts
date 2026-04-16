'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Notification, NotificationPreferences } from '@/types/notification';

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function useNotifications(page: number = 1) {
  return useQuery<PaginatedResponse<Notification>>({
    queryKey: ['notifications', page],
    queryFn: async (): Promise<PaginatedResponse<Notification>> => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      const response = await api.get<{ data: PaginatedResponse<Notification> }>(
        `/notifications?${params.toString()}`,
      );
      return response.data.data;
    },
  });
}

export function useUnreadNotificationCount() {
  return useQuery<{ count: number }>({
    queryKey: ['notifications', 'unreadCount'],
    queryFn: async (): Promise<{ count: number }> => {
      const response = await api.get<{ data: { count: number } }>('/notifications/unread-count');
      return response.data.data;
    },
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (id: string): Promise<void> => {
      await api.patch(`/notifications/${id}/read`);
    },
    onSuccess: (): void => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: async (): Promise<void> => {
      await api.patch('/notifications/read-all');
    },
    onSuccess: (): void => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useNotificationPreferences() {
  return useQuery<NotificationPreferences>({
    queryKey: ['notifications', 'preferences'],
    queryFn: async (): Promise<NotificationPreferences> => {
      const response = await api.get<{ data: NotificationPreferences }>(
        '/notifications/preferences',
      );
      return response.data.data;
    },
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation<NotificationPreferences, Error, NotificationPreferences>({
    mutationFn: async (prefs: NotificationPreferences): Promise<NotificationPreferences> => {
      const response = await api.put<{ data: NotificationPreferences }>(
        '/notifications/preferences',
        prefs,
      );
      return response.data.data;
    },
    onSuccess: (): void => {
      void queryClient.invalidateQueries({
        queryKey: ['notifications', 'preferences'],
      });
    },
  });
}
