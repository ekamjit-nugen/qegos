'use client';

/**
 * Sales catalogue — lightweight read hook for dropdowns.
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { ApiResponse } from '@/types/api';

export interface SalesItem {
  _id: string;
  title: string;
  description?: string;
  price: number;
  gstInclusive?: boolean;
  category?: string;
  inputBased?: boolean;
  isActive: boolean;
  sortOrder?: number;
}

export function useSalesList() {
  return useQuery({
    queryKey: ['sales'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<SalesItem[]>>('/sales');
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
