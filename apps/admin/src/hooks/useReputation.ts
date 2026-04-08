'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Review, ReviewListQuery_Rep } from '@/types/reputation';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

export function useReviewList_Rep(filters: ReviewListQuery_Rep) {
  return useQuery({
    queryKey: ['reviews-rep', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') { params.set(key, String(value)); }
      }
      const res = await api.get<PaginatedResponse<Review>>(`/reputation/reviews?${params.toString()}`);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useReview_Rep(id: string | undefined) {
  return useQuery({
    queryKey: ['reputation-reviews', id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Review>>(`/reputation/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useReviewStats() {
  return useQuery({
    queryKey: ['reviews-rep', 'stats'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Record<string, unknown>>>('/reputation/stats');
      return res.data.data;
    },
  });
}

export function useRespondToReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, response }: { id: string; response: string }) => {
      const res = await api.post<ApiResponse<Review>>(`/reputation/reviews/${id}/respond`, { response });
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['reviews-rep'] });
      void qc.invalidateQueries({ queryKey: ['reviews-rep', vars.id] });
    },
  });
}
