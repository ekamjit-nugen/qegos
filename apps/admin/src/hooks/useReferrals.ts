'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Referral, ReferralConfig, ReferralListQuery } from '@/types/referral';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

export function useReferral(id: string | undefined) {
  return useQuery({
    queryKey: ['referrals', id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Referral>>(`/referrals/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useReferralList(filters: ReferralListQuery) {
  return useQuery({
    queryKey: ['referrals', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') { params.set(key, String(value)); }
      }
      const res = await api.get<PaginatedResponse<Referral>>(`/referrals?${params.toString()}`);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useReferralConfig() {
  return useQuery({
    queryKey: ['referrals', 'config'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<ReferralConfig>>('/referrals/config');
      return res.data.data;
    },
  });
}

export function useUpdateReferralConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<ReferralConfig>) => {
      const res = await api.put<ApiResponse<ReferralConfig>>('/referrals/config', data);
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['referrals', 'config'] });
    },
  });
}

export function useReferralDashboard() {
  return useQuery({
    queryKey: ['referrals', 'dashboard'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Record<string, unknown>>>('/referrals/dashboard');
      return res.data.data;
    },
  });
}

export function useReferralLeaderboard() {
  return useQuery({
    queryKey: ['referrals', 'leaderboard'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Array<Record<string, unknown>>>>('/referrals/leaderboard');
      return res.data.data;
    },
  });
}
