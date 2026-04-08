'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { TaxDeadline, TaxDeadlineListQuery } from '@/types/taxCalendar';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

export function useTaxDeadlineList(filters: TaxDeadlineListQuery) {
  return useQuery({
    queryKey: ['tax-deadlines', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') { params.set(key, String(value)); }
      }
      const res = await api.get<PaginatedResponse<TaxDeadline>>(`/tax-calendar/deadlines?${params.toString()}`);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useTaxDeadline(id: string | undefined) {
  return useQuery({
    queryKey: ['tax-deadlines', id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<TaxDeadline>>(`/tax-calendar/deadlines/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateTaxDeadline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<TaxDeadline>) => {
      const res = await api.post<ApiResponse<TaxDeadline>>('/tax-calendar/deadlines', data);
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tax-deadlines'] });
    },
  });
}

export function useUpdateTaxDeadline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TaxDeadline> }) => {
      const res = await api.put<ApiResponse<TaxDeadline>>(`/tax-calendar/deadlines/${id}`, data);
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['tax-deadlines', vars.id] });
      void qc.invalidateQueries({ queryKey: ['tax-deadlines'] });
    },
  });
}
