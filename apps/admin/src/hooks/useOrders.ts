'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Order, OrderListQuery } from '@/types/order';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

export function useOrderList(filters: OrderListQuery) {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') {
          params.set(key, String(value));
        }
      }
      const res = await api.get<PaginatedResponse<Order>>(`/orders?${params.toString()}`);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Order>>(`/orders/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Order>) => {
      const res = await api.post<ApiResponse<Order>>('/orders', data);
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Order> }) => {
      const res = await api.put<ApiResponse<Order>>(`/orders/${id}`, data);
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['orders', vars.id] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useTransitionOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      eFileReference,
      cancelReason,
    }: {
      id: string;
      status: number;
      eFileReference?: string;
      cancelReason?: string;
    }) => {
      const res = await api.patch<ApiResponse<Order>>(`/orders/${id}/status`, {
        status,
        eFileReference,
        cancelReason,
      });
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['orders', vars.id] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useAssignOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, processingBy }: { id: string; processingBy: string }) => {
      const res = await api.put<ApiResponse<Order>>(`/orders/${id}/assign`, { processingBy });
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['orders', vars.id] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/orders/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
