'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Order } from '@/types/order';
import type {
  VaultDocument,
  VaultYear,
  StorageUsage,
  VaultDocumentListQuery,
} from '@/types/vault';
import type { TaxYearSummary, YearComparison, AtoStatus } from '@/types/taxSummary';
import type { Conversation, ChatMessage } from '@/types/chat';
import type { Notification, NotificationPreferences } from '@/types/notification';
import type { Appointment } from '@/types/appointment';
import type { ApiResponse, PaginatedResponse } from '@/types/api';

// ─── Orders ───────────────────────────────────────────────────────────────────

export function useMyOrders(): ReturnType<typeof useQuery<Order[]>> {
  return useQuery({
    queryKey: ['portal', 'orders'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<{ orders: Order[]; total: number }>>('/orders');
      return res.data.data.orders ?? res.data.data as unknown as Order[];
    },
  });
}

export function useOrder(id: string | undefined): ReturnType<typeof useQuery<Order>> {
  return useQuery({
    queryKey: ['portal', 'orders', id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Order>>(`/orders/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

// ─── Vault ────────────────────────────────────────────────────────────────────

export function useVaultDocuments(
  filters: VaultDocumentListQuery,
): ReturnType<typeof useQuery<PaginatedResponse<VaultDocument>>> {
  return useQuery({
    queryKey: ['portal', 'vault', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') {
          params.set(key, String(value));
        }
      }
      const res = await api.get<{ status: number; data: { documents: VaultDocument[]; total: number; page: number; pages: number } }>(
        `/portal/vault/documents?${params.toString()}`,
      );
      const { documents, total, page, pages } = res.data.data;
      return {
        status: res.data.status,
        data: documents,
        meta: { page, limit: 20, total, totalPages: pages },
      } as PaginatedResponse<VaultDocument>;
    },
    placeholderData: (prev) => prev,
  });
}

export function useVaultYears(): ReturnType<typeof useQuery<VaultYear[]>> {
  return useQuery({
    queryKey: ['portal', 'vault', 'years'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<{ years: VaultYear[] }>>('/portal/vault/years');
      return res.data.data.years;
    },
  });
}

export function useStorageUsage(): ReturnType<typeof useQuery<StorageUsage>> {
  return useQuery({
    queryKey: ['portal', 'vault', 'storage'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<{ used: number; quota: number; breakdown: unknown[] }>>('/portal/vault/storage');
      const { used, quota } = res.data.data;
      return {
        used,
        limit: quota,
        percentage: quota > 0 ? Math.round((used / quota) * 100) : 0,
        documents: 0,
      } satisfies StorageUsage;
    },
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await api.post<ApiResponse<VaultDocument>>(
        '/portal/vault/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'vault'] });
    },
  });
}

export function useVaultDocument(id: string | undefined) {
  return useQuery({
    queryKey: ['portal', 'vault', 'document', id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<{ document: VaultDocument; downloadUrl: string }>>(
        `/portal/vault/documents/${id}`,
      );
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useArchiveDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/portal/vault/documents/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'vault'] });
    },
  });
}

export function useRestoreDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/portal/vault/documents/${id}/restore`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'vault'] });
    },
  });
}

// ─── Tax Summaries ────────────────────────────────────────────────────────────

export function useTaxSummaries(): ReturnType<typeof useQuery<TaxYearSummary[]>> {
  return useQuery({
    queryKey: ['portal', 'tax-summaries'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<{ summaries: TaxYearSummary[] }>>('/portal/tax-summaries');
      return res.data.data.summaries;
    },
  });
}

export function useYearComparison(
  year: string | undefined,
): ReturnType<typeof useQuery<YearComparison>> {
  return useQuery({
    queryKey: ['portal', 'tax-summaries', 'compare', year],
    queryFn: async () => {
      const res = await api.get<ApiResponse<YearComparison>>(
        `/portal/tax-summaries/${year}/compare`,
      );
      return res.data.data;
    },
    enabled: !!year,
  });
}

export function useAtoStatus(
  year: string | undefined,
): ReturnType<typeof useQuery<AtoStatus>> {
  return useQuery({
    queryKey: ['portal', 'tax-summaries', 'ato', year],
    queryFn: async () => {
      const res = await api.get<ApiResponse<AtoStatus>>(
        `/portal/tax-summaries/${year}/ato-status`,
      );
      return res.data.data;
    },
    enabled: !!year,
  });
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export function useConversations(): ReturnType<typeof useQuery<Conversation[]>> {
  return useQuery({
    queryKey: ['portal', 'conversations'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<{ conversations: Conversation[]; total: number }>>('/chat/conversations');
      return res.data.data.conversations;
    },
    // Real-time updates via Socket.io; fall back to 30s polling as safety net
    refetchInterval: 30_000,
  });
}

export function useConversationMessages(
  id: string | undefined,
): ReturnType<typeof useQuery<ChatMessage[]>> {
  return useQuery({
    queryKey: ['portal', 'conversations', id, 'messages'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<{ messages: ChatMessage[]; total: number }>>(
        `/chat/conversations/${id}/messages`,
      );
      return res.data.data.messages;
    },
    enabled: !!id,
    // Real-time updates via Socket.io; fall back to 30s polling as safety net
    refetchInterval: 30_000,
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
    }: {
      conversationId: string;
      content: string;
    }) => {
      const res = await api.post<ApiResponse<ChatMessage>>(
        `/chat/conversations/${conversationId}/messages`,
        { content },
      );
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: ['portal', 'conversations', vars.conversationId, 'messages'],
      });
      void qc.invalidateQueries({ queryKey: ['portal', 'conversations'] });
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      await api.patch(`/chat/conversations/${conversationId}/read`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'conversations'] });
    },
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (subject: string) => {
      const res = await api.post<ApiResponse<Conversation>>(
        '/chat/conversations',
        { subject },
      );
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'conversations'] });
    },
  });
}

// ─── Notifications ────────────────────────────────────────────────────────────

export function useNotifications(page: number = 1): ReturnType<
  typeof useQuery<PaginatedResponse<Notification>>
> {
  return useQuery({
    queryKey: ['portal', 'notifications', page],
    queryFn: async () => {
      const res = await api.get<{ status: number; data: { notifications: Notification[]; total: number } }>(
        `/notifications?page=${page}&limit=20`,
      );
      const { notifications, total } = res.data.data;
      return {
        status: res.data.status,
        data: notifications,
        meta: { page, limit: 20, total, totalPages: Math.ceil(total / 20) },
      } as PaginatedResponse<Notification>;
    },
  });
}

export function useUnreadNotificationCount(): ReturnType<typeof useQuery<number>> {
  return useQuery({
    queryKey: ['portal', 'notifications', 'unread-count'],
    queryFn: async () => {
      try {
        const res = await api.get<ApiResponse<{ count: number }>>(
          '/notifications/unread-count',
        );
        return res.data.data.count;
      } catch {
        return 0;
      }
    },
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/notifications/${id}/read`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'notifications'] });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.patch('/notifications/read-all');
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'notifications'] });
    },
  });
}

export function useNotificationPreferences(): ReturnType<
  typeof useQuery<NotificationPreferences>
> {
  return useQuery({
    queryKey: ['portal', 'notification-preferences'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<NotificationPreferences>>(
        '/notifications/preferences',
      );
      return res.data.data;
    },
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<NotificationPreferences>) => {
      const res = await api.put<ApiResponse<NotificationPreferences>>(
        '/notifications/preferences',
        data,
      );
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'notification-preferences'] });
    },
  });
}

// ─── Appointments ─────────────────────────────────────────────────────────────

export function useUpcomingAppointments(): ReturnType<typeof useQuery<Appointment[]>> {
  return useQuery({
    queryKey: ['portal', 'appointments'],
    queryFn: async () => {
      try {
        const res = await api.get<ApiResponse<Appointment[]>>('/appointments/upcoming');
        return res.data.data;
      } catch {
        return [];
      }
    },
  });
}

// ─── E-Sign Hooks ─────────────────────────────────────────────────────────

export function useGenerateClientSigningUri() {
  return useMutation({
    mutationFn: async (params: { orderId: string; zohoRequestId: string; actionId: string }) => {
      const res = await api.post<ApiResponse<{ signUrl: string }>>(
        '/documents/generate-uri',
        params,
      );
      return res.data.data;
    },
  });
}
