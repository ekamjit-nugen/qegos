'use client';

import { useQueries } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

interface DashboardStats {
  activeLeads: number;
  newLeadsToday: number;
  ordersInProgress: number;
  revenueThisMonth: number;
  overdueReminders: number;
  pendingReviews: number;
}

export function useDashboardStats(): {
  stats: DashboardStats;
  isLoading: boolean;
} {
  const results = useQueries({
    queries: [
      {
        queryKey: ['leads', 'stats', 'dashboard'],
        queryFn: async () => {
          const res = await api.get('/leads/stats/dashboard');
          return res.data.data;
        },
      },
      {
        queryKey: ['orders', 'stats'],
        queryFn: async () => {
          const res = await api.get('/orders/stats');
          return res.data.data;
        },
      },
      {
        queryKey: ['orders', 'revenue'],
        queryFn: async () => {
          const res = await api.get('/orders/revenue');
          return res.data.data;
        },
      },
      {
        queryKey: ['leads', 'reminders', 'overdue'],
        queryFn: async () => {
          const res = await api.get('/leads/reminders/overdue');
          return res.data.data;
        },
      },
    ],
  });

  const isLoading = results.some((r) => r.isLoading);

  const leadStats = (results[0].data ?? {}) as Record<string, number>;
  const orderStats = (results[1].data ?? {}) as Record<string, number>;
  const revenueData = (results[2].data ?? {}) as Record<string, number>;
  const overdueData = results[3].data;

  return {
    stats: {
      activeLeads: leadStats.activeLeads ?? 0,
      newLeadsToday: leadStats.newLeadsToday ?? 0,
      ordersInProgress: orderStats.inProgress ?? 0,
      revenueThisMonth: revenueData.thisMonth ?? 0,
      overdueReminders: Array.isArray(overdueData) ? overdueData.length : 0,
      pendingReviews: orderStats.inReview ?? 0,
    },
    isLoading,
  };
}
