import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { ApiResponse } from '@/types/api';
import type { Appointment } from '@/types/appointment';

export function useUpcomingAppointments(): ReturnType<typeof useQuery<ApiResponse<Appointment[]>>> {
  return useQuery<ApiResponse<Appointment[]>>({
    queryKey: ['upcoming-appointments'],
    queryFn: async (): Promise<ApiResponse<Appointment[]>> => {
      const res = await api.get<ApiResponse<Appointment[]>>('/appointments/upcoming');
      return res.data;
    },
  });
}
