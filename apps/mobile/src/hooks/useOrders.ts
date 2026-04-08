import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { Order } from '@/types/order';

export function useMyOrders(
  page: number = 1,
  limit: number = 20,
): ReturnType<typeof useQuery<PaginatedResponse<Order>>> {
  return useQuery<PaginatedResponse<Order>>({
    queryKey: ['orders', page, limit],
    queryFn: async (): Promise<PaginatedResponse<Order>> => {
      const res = await api.get<PaginatedResponse<Order>>('/orders', {
        params: { page, limit },
      });
      return res.data;
    },
  });
}

export function useOrder(
  id: string | undefined,
): ReturnType<typeof useQuery<ApiResponse<Order>>> {
  return useQuery<ApiResponse<Order>>({
    queryKey: ['order', id],
    queryFn: async (): Promise<ApiResponse<Order>> => {
      const res = await api.get<ApiResponse<Order>>(`/orders/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}
