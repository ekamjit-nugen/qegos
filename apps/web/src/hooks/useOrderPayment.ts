'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

export interface PricingBreakdown {
  totalAmount: number;
  discountAmount: number;
  promoCode?: string;
  promoCodeId?: string;
  promoMessage?: string;
  creditApplied: number;
  creditBalance: number;
  finalAmount: number;
}

export interface PricingPayload {
  orderId: string;
  promoCode?: string;
  useCredits?: boolean;
}

export interface PayInitPayload extends PricingPayload {
  idempotencyKey: string;
  gateway?: 'stripe' | 'payzoo';
}

export interface PayInitResult {
  paymentId: string;
  paymentNumber: string;
  clientSecret: string;
  publishableKey: string;
  gateway: 'stripe' | 'payzoo';
  amount: number;
  currency: string;
  breakdown: PricingBreakdown;
  fullyCoveredByCredits?: boolean;
}

export function usePricingPreview() {
  return useMutation<PricingBreakdown, Error, PricingPayload>({
    mutationFn: async (payload): Promise<PricingBreakdown> => {
      const { orderId, ...body } = payload;
      const res = await api.post<{ data: PricingBreakdown }>(
        `/portal/orders/${orderId}/pricing`,
        body,
      );
      return res.data.data;
    },
  });
}

export function usePayOrder() {
  const qc = useQueryClient();
  return useMutation<PayInitResult, Error, PayInitPayload>({
    mutationFn: async (payload): Promise<PayInitResult> => {
      const { orderId, ...body } = payload;
      const res = await api.post<{ data: PayInitResult }>(`/portal/orders/${orderId}/pay`, body);
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['portal', 'orders'] });
      void qc.invalidateQueries({ queryKey: ['credits'] });
    },
  });
}
