'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { SupportTicket, TicketListQuery } from '@/types/ticket';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

export function useTicketList(filters: TicketListQuery) {
  return useQuery({
    queryKey: ['tickets', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') { params.set(key, String(value)); }
      }
      const res = await api.get<PaginatedResponse<SupportTicket>>(`/tickets?${params.toString()}`);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: ['tickets', id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<SupportTicket>>(`/tickets/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<SupportTicket>) => {
      const res = await api.post<ApiResponse<SupportTicket>>('/tickets', data);
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

export function useUpdateTicketStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await api.patch<ApiResponse<SupportTicket>>(`/tickets/${id}/status`, { status });
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['tickets', vars.id] });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

export function useEscalateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<ApiResponse<SupportTicket>>(`/tickets/${id}/escalate`, {});
      return res.data.data;
    },
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: ['tickets', id] });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}
