'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

export function useSubmitFormFill(): ReturnType<typeof useMutation<FormFillResult, Error, FormFillSubmission & { draftId?: string }>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: FormFillSubmission & { draftId?: string }) => {
      const res = await api.post<ApiResponse<FormFillResult>>(
        '/portal/form-fill/submit',
        data,
      );
      return res.data.data;
    },
    onSuccess: () => {
      // Invalidate drafts list after successful submission
      void queryClient.invalidateQueries({ queryKey: ['portal', 'form-fill', 'drafts'] });
      void queryClient.invalidateQueries({ queryKey: ['portal', 'orders'] });
    },
  });
}

// ─── Draft Management ──────────────────────────────────────────────────────

export interface FormDraft {
  _id: string;
  mappingId: string;
  versionNumber: number;
  financialYear: string;
  currentStep: number;
  serviceTitle: string;
  servicePrice: number;
  formTitle: string;
  answers: Record<string, unknown>;
  personalDetails: {
    firstName?: string;
    lastName?: string;
    email?: string;
    mobile?: string;
    dateOfBirth?: string;
  };
  updatedAt: string;
  createdAt: string;
}

export function useFormDrafts(): ReturnType<typeof useQuery<FormDraft[]>> {
  return useQuery({
    queryKey: ['portal', 'form-fill', 'drafts'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<{ drafts: FormDraft[] }>>(
        '/portal/form-fill/drafts',
      );
      return res.data.data.drafts;
    },
  });
}

export interface SaveDraftPayload {
  mappingId: string;
  versionNumber: number;
  financialYear: string;
  currentStep: number;
  answers?: Record<string, unknown>;
  personalDetails?: Record<string, unknown>;
  serviceTitle: string;
  servicePrice: number;
  formTitle: string;
}

export interface SaveDraftResult {
  draft: {
    _id: string;
    mappingId: string;
    versionNumber: number;
    financialYear: string;
    currentStep: number;
    updatedAt: string;
  };
}

export function useSaveDraft(): ReturnType<typeof useMutation<SaveDraftResult, Error, SaveDraftPayload>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: SaveDraftPayload) => {
      const res = await api.put<ApiResponse<SaveDraftResult>>(
        '/portal/form-fill/drafts',
        data,
      );
      return res.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['portal', 'form-fill', 'drafts'] });
    },
  });
}

export function useDeleteDraft(): ReturnType<typeof useMutation<void, Error, string>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draftId: string) => {
      await api.delete(`/portal/form-fill/drafts/${draftId}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['portal', 'form-fill', 'drafts'] });
    },
  });
}
