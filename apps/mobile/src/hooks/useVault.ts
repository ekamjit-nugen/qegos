import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { VaultDocument, VaultYear, StorageUsage, VaultDocumentListQuery } from '@/types/vault';

export function useVaultDocuments(
  filters: VaultDocumentListQuery = {},
): ReturnType<typeof useQuery<PaginatedResponse<VaultDocument>>> {
  return useQuery<PaginatedResponse<VaultDocument>>({
    queryKey: ['vault-documents', filters],
    queryFn: async (): Promise<PaginatedResponse<VaultDocument>> => {
      const res = await api.get<PaginatedResponse<VaultDocument>>('/portal/vault/documents', {
        params: filters,
      });
      return res.data;
    },
  });
}

export function useVaultYears(): ReturnType<typeof useQuery<ApiResponse<VaultYear[]>>> {
  return useQuery<ApiResponse<VaultYear[]>>({
    queryKey: ['vault-years'],
    queryFn: async (): Promise<ApiResponse<VaultYear[]>> => {
      const res = await api.get<ApiResponse<VaultYear[]>>('/portal/vault/years');
      return res.data;
    },
  });
}

export function useStorageUsage(): ReturnType<typeof useQuery<ApiResponse<StorageUsage>>> {
  return useQuery<ApiResponse<StorageUsage>>({
    queryKey: ['vault-storage'],
    queryFn: async (): Promise<ApiResponse<StorageUsage>> => {
      const res = await api.get<ApiResponse<StorageUsage>>('/portal/vault/storage');
      return res.data;
    },
  });
}

export function useDeleteDocument(): ReturnType<
  typeof useMutation<ApiResponse<{ deleted: boolean }>, Error, string>
> {
  const queryClient = useQueryClient();

  return useMutation<ApiResponse<{ deleted: boolean }>, Error, string>({
    mutationFn: async (documentId: string): Promise<ApiResponse<{ deleted: boolean }>> => {
      const res = await api.delete<ApiResponse<{ deleted: boolean }>>(
        `/portal/vault/documents/${documentId}`,
      );
      return res.data;
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: ['vault-documents'] });
      await queryClient.invalidateQueries({ queryKey: ['vault-storage'] });
    },
  });
}
