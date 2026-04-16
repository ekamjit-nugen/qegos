'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Lead, LeadListQuery, LeadStats } from '@/types/lead';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

export function useLeadList(filters: LeadListQuery) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') {
          params.set(key, String(value));
        }
      }
      const res = await api.get<PaginatedResponse<Lead>>(`/leads?${params.toString()}`);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ['leads', id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Lead>>(`/leads/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Lead>) => {
      const res = await api.post<ApiResponse<Lead>>('/leads', data);
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Lead> }) => {
      const res = await api.put<ApiResponse<Lead>>(`/leads/${id}`, data);
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['leads', vars.id] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useTransitionLeadStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      lostReason,
      lostReasonNote,
    }: {
      id: string;
      status: number;
      lostReason?: string;
      lostReasonNote?: string;
    }) => {
      const res = await api.patch<ApiResponse<Lead>>(`/leads/${id}/status`, {
        status,
        lostReason,
        lostReasonNote,
      });
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['leads', vars.id] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useAssignLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, assignedTo }: { id: string; assignedTo: string }) => {
      const res = await api.put<ApiResponse<Lead>>(`/leads/${id}/assign`, { assignedTo });
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['leads', vars.id] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/leads/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useConvertLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<ApiResponse<{ lead: Lead; orderId: string; userId: string }>>(
        `/leads/${id}/convert`,
      );
      return res.data.data;
    },
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: ['leads', id] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useConvertToExistingUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      const res = await api.post<ApiResponse<{ lead: Lead; orderId: string }>>(
        `/leads/${id}/convert-existing`,
        { userId },
      );
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['leads', vars.id] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useLeadStats() {
  return useQuery({
    queryKey: ['leads', 'stats', 'dashboard'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<LeadStats>>('/leads/stats/dashboard');
      return res.data.data;
    },
  });
}
