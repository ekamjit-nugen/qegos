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

export interface CollectPricingPayload {
  orderId: string;
  promoCode?: string;
  useCredits?: boolean;
}

export interface CollectPaymentPayload extends CollectPricingPayload {
  idempotencyKey: string;
  gateway?: 'stripe' | 'payroo';
}

export interface CollectPaymentResult {
  paymentId?: string;
  paymentNumber?: string;
  clientSecret?: string;
  publishableKey?: string;
  gateway?: 'stripe' | 'payroo';
  amount?: number;
  currency?: string;
  breakdown: PricingBreakdown;
  fullyCoveredByCredits?: boolean;
  orderId?: string;
}

export function useCollectPricing() {
  return useMutation<PricingBreakdown, Error, CollectPricingPayload>({
    mutationFn: async (payload): Promise<PricingBreakdown> => {
      const { orderId, ...body } = payload;
      const res = await api.post<{ data: PricingBreakdown }>(
        `/orders/${orderId}/collect-pricing`,
        body,
      );
      return res.data.data;
    },
  });
}

export function useCollectPayment() {
  const qc = useQueryClient();
  return useMutation<CollectPaymentResult, Error, CollectPaymentPayload>({
    mutationFn: async (payload): Promise<CollectPaymentResult> => {
      const { orderId, ...body } = payload;
      const res = await api.post<{ data: CollectPaymentResult }>(
        `/orders/${orderId}/collect-payment`,
        body,
      );
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['orders', vars.orderId] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['payments', 'order', vars.orderId] });
      void qc.invalidateQueries({ queryKey: ['credits'] });
    },
  });
}
