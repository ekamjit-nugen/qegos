'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Document, DocumentListQuery } from '@/types/document';
import type { PaginatedResponse } from '@/types/api';

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
