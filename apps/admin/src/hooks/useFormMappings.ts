'use client';

/**
 * Form Mapping — React Query hooks
 *
 * All endpoints live under /form-mappings on the axios client in
 * apps/admin/src/lib/api/client.ts which already handles auth + CSRF.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { ApiResponse } from '@/types/api';
import type {
  CreateMappingInput,
  FormMappingDetail,
  FormMappingListRow,
  FormMappingVersion,
  UpdateDraftInput,
  ValidateSchemaResult,
  FormMappingSchema,
} from '@/types/formMapping';

interface ListFilters {
  salesItemId?: string;
  financialYear?: string;
}

const qk = {
  list: (filters: ListFilters) => ['form-mappings', filters] as const,
  detail: (mappingId: string) => ['form-mappings', mappingId] as const,
  version: (mappingId: string, version: number) =>
    ['form-mappings', mappingId, 'versions', version] as const,
};

export function useFormMappingList(filters: ListFilters = {}) {
  return useQuery({
    queryKey: qk.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.salesItemId) params.set('salesItemId', filters.salesItemId);
      if (filters.financialYear) params.set('financialYear', filters.financialYear);
      const qs = params.toString();
      const res = await api.get<ApiResponse<FormMappingListRow[]>>(
        `/form-mappings${qs ? `?${qs}` : ''}`,
      );
      return res.data.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useFormMapping(mappingId: string | undefined) {
  return useQuery({
    queryKey: mappingId ? qk.detail(mappingId) : ['form-mappings', 'none'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<FormMappingDetail>>(`/form-mappings/${mappingId}`);
      return res.data.data;
    },
    enabled: !!mappingId,
  });
}

export function useFormMappingVersion(mappingId: string | undefined, version: number | undefined) {
  return useQuery({
    queryKey:
      mappingId && version !== undefined
        ? qk.version(mappingId, version)
        : ['form-mappings', 'version', 'none'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<FormMappingVersion>>(
        `/form-mappings/${mappingId}/versions/${version}`,
      );
      return res.data.data;
    },
    enabled: !!mappingId && version !== undefined,
  });
}

export function useCreateFormMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateMappingInput) => {
      const res = await api.post<
        ApiResponse<{ mapping: FormMappingDetail['mapping']; version: FormMappingVersion }>
      >('/form-mappings', input);
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['form-mappings'] });
    },
  });
}

export function useUpdateDraft(mappingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ version, input }: { version: number; input: UpdateDraftInput }) => {
      const res = await api.patch<ApiResponse<FormMappingVersion>>(
        `/form-mappings/${mappingId}/versions/${version}`,
        input,
      );
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: qk.detail(mappingId) });
      void qc.invalidateQueries({ queryKey: qk.version(mappingId, vars.version) });
      void qc.invalidateQueries({ queryKey: ['form-mappings'] });
    },
  });
}

export function useForkVersion(mappingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sourceVersion, notes }: { sourceVersion: number; notes?: string }) => {
      const res = await api.post<ApiResponse<FormMappingVersion>>(
        `/form-mappings/${mappingId}/versions`,
        { sourceVersion, notes },
      );
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.detail(mappingId) });
      void qc.invalidateQueries({ queryKey: ['form-mappings'] });
    },
  });
}

function makeVersionAction(action: string) {
  return function useAction(mappingId: string) {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (version: number) => {
        const res = await api.post<ApiResponse<FormMappingVersion>>(
          `/form-mappings/${mappingId}/versions/${version}/${action}`,
        );
        return res.data.data;
      },
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: qk.detail(mappingId) });
        void qc.invalidateQueries({ queryKey: ['form-mappings'] });
      },
    });
  };
}

export const usePublishVersion = makeVersionAction('publish');
export const useDisableVersion = makeVersionAction('disable');
export const useEnableVersion = makeVersionAction('enable');
export const useSetDefaultVersion = makeVersionAction('set-default');

export function useDeleteDraft(mappingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (version: number) => {
      await api.delete(`/form-mappings/${mappingId}/versions/${version}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.detail(mappingId) });
      void qc.invalidateQueries({ queryKey: ['form-mappings'] });
    },
  });
}

export function useValidateSchema() {
  return useMutation({
    mutationFn: async (schema: FormMappingSchema) => {
      const res = await api.post<ApiResponse<ValidateSchemaResult>>(
        '/form-mappings/validate-schema',
        { schema },
      );
      return res.data.data;
    },
  });
}
