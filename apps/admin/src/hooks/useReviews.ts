'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { ReviewAssignment, ReviewListQuery } from '@/types/review';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

export function useReviewList(filters: ReviewListQuery) {
  return useQuery({
    queryKey: ['reviews', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') { params.set(key, String(value)); }
      }
      const res = await api.get<PaginatedResponse<ReviewAssignment>>(`/reviews?${params.toString()}`);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useReview(orderId: string | undefined) {
  return useQuery({
    queryKey: ['reviews', orderId],
    queryFn: async () => {
      const res = await api.get<ApiResponse<ReviewAssignment>>(`/reviews/${orderId}`);
      return res.data.data;
    },
    enabled: !!orderId,
  });
}

export function useStartReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const res = await api.patch<ApiResponse<ReviewAssignment>>(`/reviews/${orderId}/start`);
      return res.data.data;
    },
    onSuccess: (_data, orderId) => {
      void qc.invalidateQueries({ queryKey: ['reviews', orderId] });
      void qc.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}

export function useApproveReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, notes }: { orderId: string; notes?: string }) => {
      const res = await api.patch<ApiResponse<ReviewAssignment>>(`/reviews/${orderId}/approve`, { notes });
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['reviews', vars.orderId] });
      void qc.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}

export function useRequestChanges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      changes,
    }: {
      orderId: string;
      changes: Array<{ field: string; issue: string; instruction: string }>;
    }) => {
      const res = await api.patch<ApiResponse<ReviewAssignment>>(`/reviews/${orderId}/request-changes`, { changes });
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['reviews', vars.orderId] });
      void qc.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}

export function useRejectReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      const res = await api.patch<ApiResponse<ReviewAssignment>>(`/reviews/${orderId}/reject`, { reason });
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['reviews', vars.orderId] });
      void qc.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}
