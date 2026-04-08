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
