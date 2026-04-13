'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { PromoCode, PromoCodeUsage, PromoCodeListQuery, CreatePromoCodeInput } from '@/types/promoCode';
import type { ApiResponse } from '@/types/api';

interface PromoCodeListResponse {
  status: number;
  data: {
    promoCodes: PromoCode[];
    total: number;
    page: number;
    limit: number;
  };
}

export function usePromoCodeList(filters: PromoCodeListQuery) {
  return useQuery({
    queryKey: ['promoCodes', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') {
          params.set(key, String(value));
        }
      }
      const res = await api.get<PromoCodeListResponse>(`/promo-codes?${params.toString()}`);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function usePromoCode(id: string | undefined) {
  return useQuery({
    queryKey: ['promoCodes', id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<{ promoCode: PromoCode; usage: PromoCodeUsage[] }>>(`/promo-codes/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreatePromoCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreatePromoCodeInput) => {
      const res = await api.post<ApiResponse<PromoCode>>('/promo-codes', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promoCodes'] });
    },
  });
}

export function useUpdatePromoCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreatePromoCodeInput> }) => {
      const res = await api.patch<ApiResponse<PromoCode>>(`/promo-codes/${id}`, data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promoCodes'] });
    },
  });
}

export function useDeactivatePromoCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete<ApiResponse<PromoCode>>(`/promo-codes/${id}`);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promoCodes'] });
    },
  });
}
