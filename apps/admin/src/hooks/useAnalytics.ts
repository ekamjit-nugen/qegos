'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { ApiResponse } from '@/types/api';
import type {
  ExecutiveSummaryResponse,
  RevenueForecastResponse,
  ClvEntry,
  StaffBenchmarkEntry,
  ChannelRoiEntry,
  SeasonalTrendEntry,
  ChurnRiskEntry,
  ServiceMixEntry,
  CollectionRateResponse,
  PipelineStageEntry,
} from '@/types/analytics';

/** Default date range: last 12 months */
function defaultDateRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return {
    dateFrom: oneYearAgo.toISOString().split('T')[0],
    dateTo: now.toISOString().split('T')[0],
  };
}

/** Current Australian financial year (July-June) */
function currentFinancialYear(): string {
  const now = new Date();
  const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

export function useExecutiveSummary() {
  const { dateFrom, dateTo } = defaultDateRange();
  return useQuery({
    queryKey: ['analytics', 'executive-summary'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<ExecutiveSummaryResponse>>(
        `/analytics/executive-summary?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      );
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useRevenueForecast() {
  const { dateFrom, dateTo } = defaultDateRange();
  return useQuery({
    queryKey: ['analytics', 'revenue-forecast', dateFrom, dateTo],
    queryFn: async () => {
      const res = await api.get<ApiResponse<RevenueForecastResponse>>(
        `/analytics/revenue-forecast?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      );
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useClv(topN = 20) {
  return useQuery({
    queryKey: ['analytics', 'clv', topN],
    queryFn: async () => {
      const res = await api.post<ApiResponse<ClvEntry[]>>(
        '/analytics/clv',
        { topN },
      );
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useStaffBenchmark() {
  const { dateFrom, dateTo } = defaultDateRange();
  return useQuery({
    queryKey: ['analytics', 'staff-benchmark', dateFrom, dateTo],
    queryFn: async () => {
      const res = await api.get<ApiResponse<StaffBenchmarkEntry[]>>(
        `/analytics/staff-benchmark?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      );
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useChannelRoi() {
  const { dateFrom, dateTo } = defaultDateRange();
  return useQuery({
    queryKey: ['analytics', 'channel-roi', dateFrom, dateTo],
    queryFn: async () => {
      const res = await api.post<ApiResponse<ChannelRoiEntry[]>>(
        '/analytics/channel-roi',
        { dateFrom, dateTo },
      );
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSeasonalTrends(granularity: 'week' | 'month' = 'month') {
  const { dateFrom, dateTo } = defaultDateRange();
  return useQuery({
    queryKey: ['analytics', 'seasonal-trends', dateFrom, dateTo, granularity],
    queryFn: async () => {
      const res = await api.get<ApiResponse<SeasonalTrendEntry[]>>(
        `/analytics/seasonal-trends?dateFrom=${dateFrom}&dateTo=${dateTo}&granularity=${granularity}`,
      );
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useChurnRisk() {
  const fy = currentFinancialYear();
  return useQuery({
    queryKey: ['analytics', 'churn-risk', fy],
    queryFn: async () => {
      const res = await api.get<ApiResponse<ChurnRiskEntry[]>>(
        `/analytics/churn-risk?financialYear=${fy}`,
      );
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useServiceMix() {
  const { dateFrom, dateTo } = defaultDateRange();
  return useQuery({
    queryKey: ['analytics', 'service-mix', dateFrom, dateTo],
    queryFn: async () => {
      const res = await api.get<ApiResponse<ServiceMixEntry[]>>(
        `/analytics/service-mix?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      );
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCollectionRate() {
  const { dateFrom, dateTo } = defaultDateRange();
  return useQuery({
    queryKey: ['analytics', 'collection-rate', dateFrom, dateTo],
    queryFn: async () => {
      const res = await api.get<ApiResponse<CollectionRateResponse>>(
        `/analytics/collection-rate?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      );
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function usePipelineHealth() {
  const { dateFrom, dateTo } = defaultDateRange();
  return useQuery({
    queryKey: ['analytics', 'pipeline-health', dateFrom, dateTo],
    queryFn: async () => {
      const res = await api.get<ApiResponse<PipelineStageEntry[]>>(
        `/analytics/pipeline-health?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      );
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}
