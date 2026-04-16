'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { VaultDocument, VaultYear, StorageUsage, VaultDocumentListQuery } from '@/types/vault';

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface VaultDocumentDetail extends VaultDocument {
  downloadUrl: string;
}

export function useVaultDocuments(filters: VaultDocumentListQuery) {
  return useQuery<PaginatedResponse<VaultDocument>>({
    queryKey: ['vault', 'documents', filters],
    queryFn: async (): Promise<PaginatedResponse<VaultDocument>> => {
      const params = new URLSearchParams();
      if (filters.page !== undefined) {
        params.set('page', String(filters.page));
      }
      if (filters.limit !== undefined) {
        params.set('limit', String(filters.limit));
      }
      if (filters.financialYear) {
        params.set('financialYear', filters.financialYear);
      }
      if (filters.category) {
        params.set('category', filters.category);
      }
      const response = await api.get<{ data: PaginatedResponse<VaultDocument> }>(
        `/portal/vault/documents?${params.toString()}`,
      );
      return response.data.data;
    },
  });
}

export function useVaultDocument(id: string | undefined) {
  return useQuery<VaultDocumentDetail>({
    queryKey: ['vault', 'documents', id],
    queryFn: async (): Promise<VaultDocumentDetail> => {
      const response = await api.get<{ data: VaultDocumentDetail }>(
        `/portal/vault/documents/${id}`,
      );
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useVaultYears() {
  return useQuery<VaultYear[]>({
    queryKey: ['vault', 'years'],
    queryFn: async (): Promise<VaultYear[]> => {
      const response = await api.get<{ data: VaultYear[] }>('/portal/vault/years');
      return response.data.data;
    },
  });
}

export function useStorageUsage() {
  return useQuery<StorageUsage>({
    queryKey: ['vault', 'storage'],
    queryFn: async (): Promise<StorageUsage> => {
      const response = await api.get<{ data: StorageUsage }>('/portal/vault/storage');
      return response.data.data;
    },
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation<VaultDocument, Error, FormData>({
    mutationFn: async (formData: FormData): Promise<VaultDocument> => {
      const response = await api.post<{ data: VaultDocument }>('/portal/vault/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data.data;
    },
    onSuccess: (): void => {
      void queryClient.invalidateQueries({ queryKey: ['vault'] });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/portal/vault/documents/${id}`);
    },
    onSuccess: (): void => {
      void queryClient.invalidateQueries({ queryKey: ['vault'] });
    },
  });
}

export function useRestoreDocument() {
  const queryClient = useQueryClient();

  return useMutation<VaultDocument, Error, string>({
    mutationFn: async (id: string): Promise<VaultDocument> => {
      const response = await api.post<{ data: VaultDocument }>(
        `/portal/vault/documents/${id}/restore`,
      );
      return response.data.data;
    },
    onSuccess: (): void => {
      void queryClient.invalidateQueries({ queryKey: ['vault'] });
    },
  });
}
