'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { WhatsAppMessage, WhatsAppMessageListQuery } from '@/types/whatsapp';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

export function useWhatsAppMessages(filters: WhatsAppMessageListQuery) {
  return useQuery({
    queryKey: ['whatsapp-messages', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') { params.set(key, String(value)); }
      }
      const res = await api.get<PaginatedResponse<WhatsAppMessage>>(`/whatsapp/messages?${params.toString()}`);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useWhatsAppConfig() {
  return useQuery({
    queryKey: ['whatsapp-config'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Record<string, unknown>>>('/whatsapp/config');
      return res.data.data;
    },
  });
}

export function useSendWhatsApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { contactMobile: string; templateName: string; parameters?: Record<string, string> }) => {
      const res = await api.post<ApiResponse<WhatsAppMessage>>('/whatsapp/send', data);
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['whatsapp-messages'] });
    },
  });
}
