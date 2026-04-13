'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Payment, PaymentListQuery } from '@/types/payment';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

export function usePaymentList(filters: PaymentListQuery) {
  return useQuery({
    queryKey: ['payments', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') { params.set(key, String(value)); }
      }
      const res = await api.get<PaginatedResponse<Payment>>(`/payments?${params.toString()}`);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function usePayment(id: string | undefined) {
  return useQuery({
    queryKey: ['payments', id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Payment>>(`/payments/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function usePaymentsByOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: ['payments', 'order', orderId],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Payment>>(`/payments?orderId=${orderId}`);
      return res.data;
    },
    enabled: !!orderId,
  });
}

export function useRefundPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { paymentId: string; amount: number; reason: string }) => {
      const res = await api.post<ApiResponse<unknown>>('/payments/refund', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}
