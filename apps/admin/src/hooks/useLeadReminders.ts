'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { LeadReminder } from '@/types/lead';
import type { ApiResponse } from '@/types/api';

export function useLeadReminders(leadId: string | undefined) {
  return useQuery({
    queryKey: ['leads', leadId, 'reminders'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<LeadReminder[]>>(`/leads/${leadId}/reminders`);
      return res.data.data;
    },
    enabled: !!leadId,
  });
}

export function useTodayReminders() {
  return useQuery({
    queryKey: ['leads', 'reminders', 'today'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<LeadReminder[]>>('/leads/reminders/today');
      return res.data.data;
    },
  });
}

export function useCreateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      leadId: string;
      title: string;
      description?: string;
      reminderDate: string;
      assignedTo: string;
    }) => {
      const res = await api.post<ApiResponse<LeadReminder>>('/leads/reminders', data);
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['leads', vars.leadId, 'reminders'] });
      void qc.invalidateQueries({ queryKey: ['leads', 'reminders'] });
    },
  });
}

export function useCompleteReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/leads/reminders/${id}/complete`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useSnoozeReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, snoozedUntil }: { id: string; snoozedUntil: string }) => {
      await api.patch(`/leads/reminders/${id}/snooze`, { snoozedUntil });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
