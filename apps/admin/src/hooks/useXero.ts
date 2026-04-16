'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { XeroConfig, XeroSyncLog, SyncLogListQuery } from '@/types/xero';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

export function useXeroStatus() {
  return useQuery({
    queryKey: ['xero', 'status'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<{ connected: boolean }>>('/xero/status');
      return res.data.data;
    },
  });
}

export function useXeroConfig() {
  return useQuery({
    queryKey: ['xero', 'config'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<XeroConfig>>('/xero/config');
      return res.data.data;
    },
  });
}

export function useUpdateXeroConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<XeroConfig>) => {
      const res = await api.put<ApiResponse<XeroConfig>>('/xero/config', data);
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['xero', 'config'] });
      void qc.invalidateQueries({ queryKey: ['xero', 'status'] });
    },
  });
}

export function useXeroSyncLogs(filters: SyncLogListQuery) {
  return useQuery({
    queryKey: ['xero', 'sync-logs', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') {
          params.set(key, String(value));
        }
      }
      const res = await api.get<PaginatedResponse<XeroSyncLog>>(
        `/xero/sync-logs?${params.toString()}`,
      );
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useSyncContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contactId: string) => {
      const res = await api.post<ApiResponse<XeroSyncLog>>('/xero/sync/contact', { contactId });
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['xero', 'sync-logs'] });
    },
  });
}

export function useBulkSyncInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceIds: string[]) => {
      const res = await api.post<ApiResponse<{ queued: number }>>('/xero/sync/invoices', {
        invoiceIds,
      });
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['xero', 'sync-logs'] });
    },
  });
}

export function useReconciliation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<ApiResponse<{ reconciled: number; mismatches: number }>>(
        '/xero/reconciliation',
        {},
      );
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['xero', 'sync-logs'] });
    },
  });
}
