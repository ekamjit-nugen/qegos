'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { AuditLog, AuditLogQuery } from '@/types/auditLog';
import type { PaginatedResponse } from '@/types/api';

export function useAuditLogList(filters: AuditLogQuery) {
  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: async () => {
      const res = await api.post<PaginatedResponse<AuditLog>>('/audit-logs/query', filters);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

interface AuditStatsResponse {
  status: number;
  data: {
    actionsPerDay: Array<{ _id: string; count: number }>;
    topActors: Array<{ _id: string; count: number }>;
    criticalCount: number;
    failedLogins: number;
  };
}

export function useAuditStats() {
  return useQuery({
    queryKey: ['audit-logs', 'stats'],
    queryFn: async () => {
      const res = await api.get<AuditStatsResponse>('/audit-logs/stats');
      return res.data;
    },
    staleTime: 60_000, // cache for 1 minute
  });
}
