'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { CreateConsentFormRequest, ConsentFormSubmission } from '@/types/consentForm';

export function useMyConsentForms() {
  return useQuery<ConsentFormSubmission[]>({
    queryKey: ['consent-forms'],
    queryFn: async (): Promise<ConsentFormSubmission[]> => {
      const response = await api.get<{ data: ConsentFormSubmission[] }>('/consent-forms');
      return response.data.data;
    },
  });
}

export function useSubmitConsentForm() {
  const qc = useQueryClient();
  return useMutation<ConsentFormSubmission, Error, CreateConsentFormRequest>({
    mutationFn: async (payload): Promise<ConsentFormSubmission> => {
      const response = await api.post<{ data: ConsentFormSubmission }>('/consent-forms', payload);
      return response.data.data;
    },
    onSuccess: (): void => {
      void qc.invalidateQueries({ queryKey: ['consent-forms'] });
    },
  });
}
