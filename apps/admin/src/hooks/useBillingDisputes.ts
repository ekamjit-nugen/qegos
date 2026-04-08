'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { BillingDispute, DisputeListQuery } from '@/types/billingDispute';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

export function useBillingDisputeList(filters: DisputeListQuery) {
  return useQuery({
    queryKey: ['billing-disputes', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') { params.set(key, String(value)); }
      }
      const res = await api.get<PaginatedResponse<BillingDispute>>(`/billing-disputes?${params.toString()}`);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useBillingDispute(id: string | undefined) {
  return useQuery({
    queryKey: ['billing-disputes', id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<BillingDispute>>(`/billing-disputes/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateBillingDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<BillingDispute>) => {
      const res = await api.post<ApiResponse<BillingDispute>>('/billing-disputes', data);
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['billing-disputes'] });
    },
  });
}

export function useUpdateBillingDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BillingDispute> }) => {
      const res = await api.put<ApiResponse<BillingDispute>>(`/billing-disputes/${id}`, data);
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['billing-disputes', vars.id] });
      void qc.invalidateQueries({ queryKey: ['billing-disputes'] });
    },
  });
}
