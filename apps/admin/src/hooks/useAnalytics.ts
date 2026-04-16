'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
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

// ─── Shared params ──────────────────────────────────────────────────

interface DateRangeParams {
  dateFrom: string;
  dateTo: string;
}

/** Current Australian financial year (July-June) */
function currentFinancialYear(): string {
  const now = new Date();
  const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

// ─── Executive Summary ──────────────────────────────────────────────

export function useExecutiveSummary(params?: DateRangeParams) {
  const dateFrom = params?.dateFrom ?? '';
  const dateTo = params?.dateTo ?? '';
  return useQuery({
    queryKey: ['analytics', 'executive-summary', dateFrom, dateTo],
    queryFn: async () => {
      const qs = dateFrom ? `?dateFrom=${dateFrom}&dateTo=${dateTo}` : '';
      const res = await api.get<ApiResponse<ExecutiveSummaryResponse>>(
        `/analytics/executive-summary${qs}`,
      );
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

// ─── Revenue Forecast ───────────────────────────────────────────────

export function useRevenueForecast(params: DateRangeParams) {
  return useQuery({
    queryKey: ['analytics', 'revenue-forecast', params.dateFrom, params.dateTo],
    queryFn: async () => {
      const res = await api.get<ApiResponse<RevenueForecastResponse>>(
        `/analytics/revenue-forecast?dateFrom=${params.dateFrom}&dateTo=${params.dateTo}`,
      );
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

// ─── CLV ────────────────────────────────────────────────────────────

export function useClv(topN = 20) {
  return useQuery({
    queryKey: ['analytics', 'clv', topN],
    queryFn: async () => {
      const res = await api.post<ApiResponse<ClvEntry[]>>('/analytics/clv', { topN });
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

// ─── Staff Benchmark ────────────────────────────────────────────────

export function useStaffBenchmark(params: DateRangeParams) {
  return useQuery({
    queryKey: ['analytics', 'staff-benchmark', params.dateFrom, params.dateTo],
    queryFn: async () => {
      const res = await api.get<ApiResponse<StaffBenchmarkEntry[]>>(
        `/analytics/staff-benchmark?dateFrom=${params.dateFrom}&dateTo=${params.dateTo}`,
      );
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

// ─── Channel ROI ────────────────────────────────────────────────────

export function useChannelRoi(params: DateRangeParams) {
  return useQuery({
    queryKey: ['analytics', 'channel-roi', params.dateFrom, params.dateTo],
    queryFn: async () => {
      const res = await api.post<ApiResponse<ChannelRoiEntry[]>>('/analytics/channel-roi', {
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
      });
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

// ─── Seasonal Trends ────────────────────────────────────────────────

export function useSeasonalTrends(
  params: DateRangeParams,
  granularity: 'week' | 'month' = 'month',
) {
  return useQuery({
    queryKey: ['analytics', 'seasonal-trends', params.dateFrom, params.dateTo, granularity],
    queryFn: async () => {
      const res = await api.get<ApiResponse<SeasonalTrendEntry[]>>(
        `/analytics/seasonal-trends?dateFrom=${params.dateFrom}&dateTo=${params.dateTo}&granularity=${granularity}`,
      );
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

// ─── Churn Risk ─────────────────────────────────────────────────────

export function useChurnRisk(financialYear?: string) {
  const fy = financialYear ?? currentFinancialYear();
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

// ─── Service Mix ────────────────────────────────────────────────────

export function useServiceMix(params: DateRangeParams) {
  return useQuery({
    queryKey: ['analytics', 'service-mix', params.dateFrom, params.dateTo],
    queryFn: async () => {
      const res = await api.get<ApiResponse<ServiceMixEntry[]>>(
        `/analytics/service-mix?dateFrom=${params.dateFrom}&dateTo=${params.dateTo}`,
      );
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

// ─── Collection Rate ────────────────────────────────────────────────

export function useCollectionRate(params: DateRangeParams) {
  return useQuery({
    queryKey: ['analytics', 'collection-rate', params.dateFrom, params.dateTo],
    queryFn: async () => {
      const res = await api.get<ApiResponse<CollectionRateResponse>>(
        `/analytics/collection-rate?dateFrom=${params.dateFrom}&dateTo=${params.dateTo}`,
      );
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

// ─── Pipeline Health ────────────────────────────────────────────────

export function usePipelineHealth(params: DateRangeParams) {
  return useQuery({
    queryKey: ['analytics', 'pipeline-health', params.dateFrom, params.dateTo],
    queryFn: async () => {
      const res = await api.get<ApiResponse<PipelineStageEntry[]>>(
        `/analytics/pipeline-health?dateFrom=${params.dateFrom}&dateTo=${params.dateTo}`,
      );
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

// ─── Export ─────────────────────────────────────────────────────────

export interface ExportParams {
  format: 'pdf' | 'xlsx';
  widgets: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface ExportJobResponse {
  jobId: string;
  status: 'queued';
  format: 'pdf' | 'xlsx';
  widgets: string[];
}

export function useExportAnalytics() {
  return useMutation({
    mutationFn: async (params: ExportParams) => {
      const res = await api.post<ApiResponse<ExportJobResponse>>('/analytics/export', params);
      return res.data.data;
    },
  });
}
