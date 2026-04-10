'use client';

/**
 * Broadcasts — admin-side React Query hooks.
 *
 * All endpoints live under /broadcasts on the axios client in
 * apps/admin/src/lib/api/client.ts which already handles auth + CSRF.
 * The API server gates everything behind `broadcasts:*` RBAC.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type {
  AudienceCountResult,
  BroadcastTemplate,
  Campaign,
  CampaignListQuery,
  CreateCampaignInput,
  CreateTemplateInput,
  PreviewInput,
  PreviewResult,
  TemplateListQuery,
  UpdateTemplateInput,
} from '@/types/broadcast';

// ─── Campaigns ───────────────────────────────────────────────────────

export function useCampaignList(filters: CampaignListQuery) {
  return useQuery({
    queryKey: ['campaigns', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') params.set(key, String(value));
      }
      const res = await api.get<PaginatedResponse<Campaign>>(
        `/broadcasts/campaigns?${params.toString()}`,
      );
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
    mutationFn: async (data: CreateCampaignInput): Promise<Campaign> => {
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
    mutationFn: async (id: string): Promise<{ totalQueued: number }> => {
      const res = await api.post<ApiResponse<{ totalQueued: number }>>(
        `/broadcasts/campaigns/${id}/send`,
        {},
      );
      return res.data.data;
    },
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: ['campaigns', id] });
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function usePauseCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<Campaign> => {
      const res = await api.patch<ApiResponse<Campaign>>(
        `/broadcasts/campaigns/${id}/pause`,
        {},
      );
      return res.data.data;
    },
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: ['campaigns', id] });
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function useResumeCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<Campaign> => {
      const res = await api.patch<ApiResponse<Campaign>>(
        `/broadcasts/campaigns/${id}/resume`,
        {},
      );
      return res.data.data;
    },
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: ['campaigns', id] });
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function useDuplicateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<Campaign> => {
      const res = await api.post<ApiResponse<Campaign>>(
        `/broadcasts/campaigns/${id}/duplicate`,
        {},
      );
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function useCampaignAudienceCount() {
  return useMutation({
    mutationFn: async (id: string): Promise<AudienceCountResult> => {
      const res = await api.post<ApiResponse<AudienceCountResult>>(
        `/broadcasts/campaigns/${id}/audience-count`,
        {},
      );
      return res.data.data;
    },
  });
}

// ─── Preview (engine renders body + footers + merge tags) ────────────

export function usePreviewMessage() {
  return useMutation({
    mutationFn: async (input: PreviewInput): Promise<PreviewResult> => {
      // The engine's standalone preview endpoint accepts the body
      // inline so we can render before a campaign exists.
      const res = await api.post<ApiResponse<PreviewResult>>(
        '/broadcasts/preview',
        input,
      );
      return res.data.data;
    },
  });
}

// ─── Templates ───────────────────────────────────────────────────────

export function useTemplateList(filters: TemplateListQuery = {}) {
  return useQuery({
    queryKey: ['broadcast-templates', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') params.set(key, String(value));
      }
      const qs = params.toString();
      const res = await api.get<PaginatedResponse<BroadcastTemplate>>(
        `/broadcasts/templates${qs ? `?${qs}` : ''}`,
      );
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTemplateInput): Promise<BroadcastTemplate> => {
      const res = await api.post<ApiResponse<BroadcastTemplate>>(
        '/broadcasts/templates',
        input,
      );
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['broadcast-templates'] });
    },
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      input: UpdateTemplateInput;
    }): Promise<BroadcastTemplate> => {
      const res = await api.put<ApiResponse<BroadcastTemplate>>(
        `/broadcasts/templates/${args.id}`,
        args.input,
      );
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['broadcast-templates'] });
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/broadcasts/templates/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['broadcast-templates'] });
    },
  });
}
