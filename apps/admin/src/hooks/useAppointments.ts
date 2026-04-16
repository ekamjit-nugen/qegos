'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Appointment, AppointmentListQuery } from '@/types/appointment';
import type { PaginatedResponse, ApiResponse } from '@/types/api';

export function useAppointmentList(filters: AppointmentListQuery) {
  return useQuery({
    queryKey: ['appointments', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') {
          params.set(key, String(value));
        }
      }
      const res = await api.get<PaginatedResponse<Appointment>>(
        `/appointments?${params.toString()}`,
      );
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useAppointment(id: string | undefined) {
  return useQuery({
    queryKey: ['appointments', id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Appointment>>(`/appointments/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Appointment>) => {
      const res = await api.post<ApiResponse<Appointment>>('/appointments', data);
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

export function useUpdateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Appointment> }) => {
      const res = await api.put<ApiResponse<Appointment>>(`/appointments/${id}`, data);
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['appointments', vars.id] });
      void qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

export function useTransitionAppointmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await api.patch<ApiResponse<Appointment>>(`/appointments/${id}/status`, {
        status,
      });
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['appointments', vars.id] });
      void qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}
