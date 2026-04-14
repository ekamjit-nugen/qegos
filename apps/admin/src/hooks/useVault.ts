'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { VaultDocument, VaultDocumentListQuery, StorageUsage } from '@/types/document';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

export function useClientVaultDocuments(
  userId: string | undefined,
  filters: VaultDocumentListQuery,
) {
  return useQuery({
    queryKey: ['vault', 'admin', userId, 'documents', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') {
          params.set(key, String(value));
        }
      }
      const res = await api.get<{
        status: number;
        data: { documents: VaultDocument[]; total: number; page: number; pages: number };
      }>(`/portal/vault/admin/users/${userId}/documents?${params.toString()}`);
      const { documents, total, page, pages } = res.data.data;
      return {
        status: res.data.status,
        data: documents,
        meta: { page, limit: filters.limit ?? 20, total, totalPages: pages },
      } as PaginatedResponse<VaultDocument>;
    },
    enabled: !!userId,
    placeholderData: (prev) => prev,
  });
}

export function useClientStorageUsage(userId: string | undefined) {
  return useQuery({
    queryKey: ['vault', 'admin', userId, 'storage'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<StorageUsage>>(
        `/portal/vault/admin/users/${userId}/storage`,
      );
      return res.data.data;
    },
    enabled: !!userId,
  });
}

export function useUploadOnBehalf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, formData }: { userId: string; formData: FormData }) => {
      const res = await api.post<ApiResponse<{ document: VaultDocument }>>(
        `/portal/vault/admin/users/${userId}/upload`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['vault', 'admin', vars.userId] });
    },
  });
}

export function useDownloadVaultDocument() {
  return useMutation({
    mutationFn: async ({ userId, docId }: { userId: string; docId: string }) => {
      const res = await api.get<ApiResponse<{ document: VaultDocument; downloadUrl: string }>>(
        `/portal/vault/admin/users/${userId}/documents/${docId}`,
      );
      return res.data.data;
    },
  });
}
