'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Appointment } from '@/types/appointment';

export function useUpcomingAppointments() {
  return useQuery<Appointment[]>({
    queryKey: ['appointments', 'upcoming'],
    queryFn: async (): Promise<Appointment[]> => {
      const response = await api.get<{ data: Appointment[] }>(
        '/appointments/upcoming'
      );
      return response.data.data;
    },
  });
}
