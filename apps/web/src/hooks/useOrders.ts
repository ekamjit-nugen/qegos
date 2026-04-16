'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Order } from '@/types/order';

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function useMyOrders(page: number = 1, limit: number = 10) {
  return useQuery<PaginatedResponse<Order>>({
    queryKey: ['orders', page, limit],
    queryFn: async (): Promise<PaginatedResponse<Order>> => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      const response = await api.get<{ data: PaginatedResponse<Order> }>(
        `/orders?${params.toString()}`,
      );
      return response.data.data;
    },
  });
}

export function useOrder(id: string | undefined) {
  return useQuery<Order>({
    queryKey: ['orders', id],
    queryFn: async (): Promise<Order> => {
      const response = await api.get<{ data: Order }>(`/orders/${id}`);
      return response.data.data;
    },
    enabled: !!id,
  });
}
