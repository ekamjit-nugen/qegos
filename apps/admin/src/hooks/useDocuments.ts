'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Document, DocumentListQuery } from '@/types/document';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

export function useDocumentList(filters: DocumentListQuery) {
  return useQuery({
    queryKey: ['documents', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') { params.set(key, String(value)); }
      }
      const res = await api.get<PaginatedResponse<Document>>(`/documents?${params.toString()}`);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useUploadOrderDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, formData }: { orderId: string; formData: FormData }) => {
      const res = await api.post<ApiResponse<{ document: Document }>>(
        `/documents/upload`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['orders', vars.orderId] });
      void qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}
