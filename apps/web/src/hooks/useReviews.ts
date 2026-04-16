'use client';

import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

interface SubmitReviewPayload {
  orderId: string;
  rating: number;
  npsScore?: number;
  comment?: string;
  tags?: string[];
}

interface ReviewResponse {
  _id: string;
  orderId: string;
  rating: number;
  npsScore?: number;
  comment?: string;
  tags?: string[];
  createdAt: string;
}

export function useSubmitReview() {
  return useMutation<ReviewResponse, Error, SubmitReviewPayload>({
    mutationFn: async (payload: SubmitReviewPayload): Promise<ReviewResponse> => {
      const response = await api.post<{ data: ReviewResponse }>('/reputation/submit', payload);
      return response.data.data;
    },
  });
}
