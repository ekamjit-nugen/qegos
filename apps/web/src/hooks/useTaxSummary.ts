'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { TaxYearSummary, YearComparison, AtoStatus } from '@/types/taxSummary';

export function useTaxSummaries() {
  return useQuery<TaxYearSummary[]>({
    queryKey: ['taxSummaries'],
    queryFn: async (): Promise<TaxYearSummary[]> => {
      const response = await api.get<{ data: TaxYearSummary[] }>('/portal/tax-summaries');
      return response.data.data;
    },
  });
}

export function useYearComparison(year: string | undefined) {
  return useQuery<YearComparison>({
    queryKey: ['taxSummaries', 'compare', year],
    queryFn: async (): Promise<YearComparison> => {
      const response = await api.get<{ data: YearComparison }>(
        `/portal/tax-summaries/${year}/compare`,
      );
      return response.data.data;
    },
    enabled: !!year,
  });
}

export function useAtoStatus(year: string | undefined) {
  return useQuery<AtoStatus>({
    queryKey: ['atoStatus', year],
    queryFn: async (): Promise<AtoStatus> => {
      const response = await api.get<{ data: AtoStatus }>(`/portal/ato-status/${year}`);
      return response.data.data;
    },
    enabled: !!year,
  });
}
