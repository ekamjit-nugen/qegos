import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { ApiResponse } from '@/types/api';
import type { TaxSummary, AtoStatus } from '@/types/taxSummary';

export function useTaxSummaries(): ReturnType<typeof useQuery<ApiResponse<TaxSummary[]>>> {
  return useQuery<ApiResponse<TaxSummary[]>>({
    queryKey: ['tax-summaries'],
    queryFn: async (): Promise<ApiResponse<TaxSummary[]>> => {
      const res = await api.get<ApiResponse<TaxSummary[]>>('/portal/tax-summaries');
      return res.data;
    },
  });
}

export function useAtoStatus(
  year: string | undefined,
): ReturnType<typeof useQuery<ApiResponse<AtoStatus>>> {
  return useQuery<ApiResponse<AtoStatus>>({
    queryKey: ['ato-status', year],
    queryFn: async (): Promise<ApiResponse<AtoStatus>> => {
      const res = await api.get<ApiResponse<AtoStatus>>(`/portal/ato-status/${year}`);
      return res.data;
    },
    enabled: !!year,
  });
}
