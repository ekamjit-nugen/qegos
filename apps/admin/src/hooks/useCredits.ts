'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { CreditTransaction } from '@/types/credit';

interface CreditBalanceResponse {
  status: number;
  data: { userId: string; balance: number };
}

interface CreditTransactionsResponse {
  status: number;
  data: CreditTransaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function useUserCreditBalance(userId: string | undefined) {
  return useQuery({
    queryKey: ['credits', 'balance', userId],
    queryFn: async () => {
      const res = await api.get<CreditBalanceResponse>(`/credits/balance/${userId}`);
      return res.data.data;
    },
    enabled: !!userId,
  });
}

export function useUserCreditTransactions(userId: string | undefined, page = 1, limit = 20) {
  return useQuery({
    queryKey: ['credits', 'transactions', userId, page, limit],
    queryFn: async () => {
      const res = await api.get<CreditTransactionsResponse>(
        `/credits/transactions/${userId}?page=${page}&limit=${limit}`,
      );
      return res.data;
    },
    enabled: !!userId,
  });
}
