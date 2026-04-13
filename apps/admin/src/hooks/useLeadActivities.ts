'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { LeadActivity } from '@/types/lead';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

export function useLeadActivities(leadId: string | undefined, page = 1) {
  return useQuery({
    queryKey: ['leads', leadId, 'activities', page],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<LeadActivity>>(
        `/leads/${leadId}/activities?page=${page}&limit=20`,
      );
      return res.data;
    },
    enabled: !!leadId,
  });
}

export function useLogActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      leadId: string;
      type: string;
      description: string;
      outcome?: string;
      sentiment?: string;
      callDuration?: number;
      callDirection?: string;
    }) => {
      const res = await api.post<ApiResponse<LeadActivity>>('/leads/activities', data);
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['leads', vars.leadId, 'activities'] });
    },
  });
}
