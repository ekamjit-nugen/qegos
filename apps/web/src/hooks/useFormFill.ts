'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { AvailableFormMapping, FormFillSubmission, FormFillResult } from '@/types/formMapping';
import type { ApiResponse } from '@/types/api';

// ─── Available Form Mappings ───────────────────────────────────────────────

export function useAvailableFormMappings(): ReturnType<typeof useQuery<AvailableFormMapping[]>> {
  return useQuery({
    queryKey: ['portal', 'form-mappings', 'available'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<{ mappings: AvailableFormMapping[] }>>(
        '/portal/form-mappings/available',
      );
      return res.data.data.mappings;
    },
  });
}

// ─── Form Mapping Schema ───────────────────────────────────────────────────

export function useFormMappingSchema(mappingId: string | undefined, version: number | undefined): ReturnType<typeof useQuery<AvailableFormMapping>> {
  return useQuery({
    queryKey: ['portal', 'form-mappings', mappingId, 'version', version],
    queryFn: async () => {
      const res = await api.get<ApiResponse<AvailableFormMapping>>(
        `/portal/form-mappings/${mappingId}/version/${version}`,
      );
      return res.data.data;
    },
    enabled: !!mappingId && !!version,
  });
}

// ─── Submit Form Fill ──────────────────────────────────────────────────────

export function useSubmitFormFill(): ReturnType<typeof useMutation<FormFillResult, Error, FormFillSubmission>> {
  return useMutation({
    mutationFn: async (data: FormFillSubmission) => {
      const res = await api.post<ApiResponse<FormFillResult>>(
        '/portal/form-fill/submit',
        data,
      );
      return res.data.data;
    },
  });
}
