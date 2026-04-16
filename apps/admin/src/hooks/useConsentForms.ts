'use client';

/**
 * Consent Forms — admin-side React Query hooks.
 *
 * All endpoints live under /consent-forms/admin. The axios client in
 * apps/admin/src/lib/api/client.ts handles auth + CSRF. The server
 * gates both endpoints behind `consent_forms:read` RBAC.
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { ApiResponse } from '@/types/api';
import type { ConsentFormAdminListFilters, ConsentFormSubmission } from '@/types/consentForm';

interface AdminListApiResponse {
  status: number;
  data: ConsentFormSubmission[];
  meta: { total: number };
}

const qk = {
  list: (filters: ConsentFormAdminListFilters) => ['consent-forms', 'admin', filters] as const,
  detail: (id: string) => ['consent-forms', 'admin', id] as const,
};

export function useAdminConsentFormList(filters: ConsentFormAdminListFilters = {}) {
  return useQuery({
    queryKey: qk.list(filters),
    queryFn: async (): Promise<{ rows: ConsentFormSubmission[]; total: number }> => {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.workType) params.set('workType', filters.workType);
      if (filters.userId) params.set('userId', filters.userId);
      if (filters.limit != null) params.set('limit', String(filters.limit));
      if (filters.skip != null) params.set('skip', String(filters.skip));
      const qs = params.toString();
      const res = await api.get<AdminListApiResponse>(`/consent-forms/admin${qs ? `?${qs}` : ''}`);
      return { rows: res.data.data, total: res.data.meta.total };
    },
    placeholderData: (prev) => prev,
  });
}

export function useAdminConsentFormDetail(id: string | null) {
  return useQuery({
    queryKey: qk.detail(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<ConsentFormSubmission> => {
      const res = await api.get<ApiResponse<ConsentFormSubmission>>(`/consent-forms/admin/${id}`);
      return res.data.data;
    },
  });
}
