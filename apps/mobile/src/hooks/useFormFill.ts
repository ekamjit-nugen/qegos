import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { ApiResponse } from '@/types/api';
import type {
  AvailableFormMapping,
  FormFillSubmission,
  FormFillResult,
  FormDraft,
  SaveDraftPayload,
} from '@/types/formMapping';

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

export function useSubmitFormFill(): ReturnType<
  typeof useMutation<FormFillResult, Error, FormFillSubmission & { draftId?: string }>
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      const res = await api.post<ApiResponse<FormFillResult>>('/portal/form-fill/submit', data);
      return res.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['portal', 'form-fill', 'drafts'] });
    },
  });
}

export function useFormDrafts(): ReturnType<typeof useQuery<FormDraft[]>> {
  return useQuery({
    queryKey: ['portal', 'form-fill', 'drafts'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<{ drafts: FormDraft[] }>>('/portal/form-fill/drafts');
      return res.data.data.drafts;
    },
  });
}

export function useSaveDraft(): ReturnType<
  typeof useMutation<{ draft: { _id: string } }, Error, SaveDraftPayload>
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      const res = await api.put<ApiResponse<{ draft: { _id: string } }>>(
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
