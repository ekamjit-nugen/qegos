'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

export interface Setting {
  _id: string;
  key: string;
  value: unknown;
  description: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export function useSettings(): ReturnType<typeof useQuery<Setting[]>> {
  return useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => {
      const res = await api.get<{ status: number; data: { settings: Setting[] } }>(
        '/settings',
      );
      return res.data.data.settings;
    },
  });
}

export function useUpdateSetting(): ReturnType<
  typeof useMutation<Setting, Error, { key: string; value: unknown }>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const res = await api.patch<{ status: number; data: Setting }>(
        `/settings/${encodeURIComponent(key)}`,
        { value },
      );
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
  });
}
