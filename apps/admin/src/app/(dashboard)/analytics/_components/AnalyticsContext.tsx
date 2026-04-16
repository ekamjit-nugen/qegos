'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import dayjs, { type Dayjs } from 'dayjs';

export interface AnalyticsFilters {
  dateFrom: string;
  dateTo: string;
  granularity: 'week' | 'month';
}

interface AnalyticsContextValue {
  filters: AnalyticsFilters;
  setDateRange: (from: Dayjs, to: Dayjs) => void;
  setGranularity: (g: 'week' | 'month') => void;
  /** Current AU financial year string, e.g. "2025-2026" */
  financialYear: string;
  /** Force all widgets to refetch */
  refreshKey: number;
  refresh: () => void;
}

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

function defaultRange(): { dateFrom: string; dateTo: string } {
  const now = dayjs();
  const oneYearAgo = now.subtract(1, 'year');
  return {
    dateFrom: oneYearAgo.format('YYYY-MM-DD'),
    dateTo: now.format('YYYY-MM-DD'),
  };
}

function getCurrentFY(): string {
  const now = new Date();
  const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }): React.ReactNode {
  const defaultDates = defaultRange();
  const [dateFrom, setDateFrom] = useState(defaultDates.dateFrom);
  const [dateTo, setDateTo] = useState(defaultDates.dateTo);
  const [granularity, setGranularity] = useState<'week' | 'month'>('month');
  const [refreshKey, setRefreshKey] = useState(0);

  const setDateRange = useCallback((from: Dayjs, to: Dayjs) => {
    setDateFrom(from.format('YYYY-MM-DD'));
    setDateTo(to.format('YYYY-MM-DD'));
  }, []);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const value = useMemo<AnalyticsContextValue>(
    () => ({
      filters: { dateFrom, dateTo, granularity },
      setDateRange,
      setGranularity,
      financialYear: getCurrentFY(),
      refreshKey,
      refresh,
    }),
    [dateFrom, dateTo, granularity, refreshKey, setDateRange, refresh],
  );

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

export function useAnalyticsContext(): AnalyticsContextValue {
  const ctx = useContext(AnalyticsContext);
  if (!ctx) throw new Error('useAnalyticsContext must be used within AnalyticsProvider');
  return ctx;
}
