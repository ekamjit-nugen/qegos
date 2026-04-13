'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { CreditTransaction, PromoCodeValidationResult } from '@/types/credit';

interface CreditBalanceResponse {
  status: number;
  data: { balance: number };
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

interface PromoValidationResponse {
  status: number;
  data: PromoCodeValidationResult;
}

export function useCreditBalance() {
  return useQuery({
    queryKey: ['credits', 'balance'],
    queryFn: async () => {
      const res = await api.get<CreditBalanceResponse>('/credits/balance');
      return res.data.data;
    },
  });
}

export function useCreditTransactions(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['credits', 'transactions', page, limit],
    queryFn: async () => {
      const res = await api.get<CreditTransactionsResponse>(
        `/credits/transactions?page=${page}&limit=${limit}`,
      );
      return res.data;
    },
  });
}

export function useValidatePromoCode() {
  return useMutation({
    mutationFn: async (data: { code: string; orderAmount: number; salesItemId?: string }) => {
      const res = await api.post<PromoValidationResponse>('/portal/validate-promo', data);
      return res.data.data;
    },
  });
}
