'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Campaign, CampaignListQuery } from '@/types/broadcast';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

export function useCampaignList(filters: CampaignListQuery) {
  return useQuery({
    queryKey: ['campaigns', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') { params.set(key, String(value)); }
      }
      const res = await api.get<PaginatedResponse<Campaign>>(`/broadcasts/campaigns?${params.toString()}`);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useCampaign(id: string | undefined) {
  return useQuery({
    queryKey: ['campaigns', id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Campaign>>(`/broadcasts/campaigns/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Campaign>) => {
      const res = await api.post<ApiResponse<Campaign>>('/broadcasts/campaigns', data);
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function useSendCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<ApiResponse<Campaign>>(`/broadcasts/campaigns/${id}/send`, {});
      return res.data.data;
    },
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: ['campaigns', id] });
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}
