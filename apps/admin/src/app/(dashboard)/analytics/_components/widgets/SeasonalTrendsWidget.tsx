'use client';

import { CalendarOutlined } from '@ant-design/icons';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useSeasonalTrends } from '@/hooks/useAnalytics';
import { formatCurrency } from '@/lib/utils/format';
import { WidgetCard } from '../WidgetCard';
import { useAnalyticsContext } from '../AnalyticsContext';

export function SeasonalTrendsWidget(): React.ReactNode {
  const { filters } = useAnalyticsContext();
  const { data, isLoading, error, refetch } = useSeasonalTrends(filters, filters.granularity);

  const chartData = (data ?? []).map((s) => ({
    period: s.period,
    'This Year Orders': s.orderCount,
    'Last Year Orders': s.previousYearOrderCount ?? 0,
    'This Year Revenue': s.revenueCents / 100,
    'Last Year Revenue': (s.previousYearRevenueCents ?? 0) / 100,
  }));

  return (
    <WidgetCard
      title={<span><CalendarOutlined /><span style={{ marginLeft: 8 }}>Seasonal Trends</span></span>}
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => void refetch()}
      empty={!data || data.length === 0}
      emptyText="No seasonal data"
      minHeight={370}
      extra={
        <span style={{ fontSize: 11, color: '#8c8c8c' }}>
          {filters.granularity === 'month' ? 'Monthly' : 'Weekly'}
        </span>
      }
    >
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="period" fontSize={11} tickMargin={4} />
          <YAxis
            yAxisId="left"
            fontSize={11}
            label={{ value: 'Orders', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            fontSize={11}
            tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
            label={{ value: 'Revenue', angle: 90, position: 'insideRight', style: { fontSize: 10 } }}
          />
          <Tooltip
            formatter={(value: number, name: string) => {
              if (name.includes('Revenue')) return [formatCurrency(value * 100), name];
              return [value, name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="This Year Orders"
            stroke="#1677ff"
            fill="#1677ff"
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="Last Year Orders"
            stroke="#8c8c8c"
            fill="#8c8c8c"
            fillOpacity={0.08}
            strokeDasharray="4 3"
            strokeWidth={1.5}
          />
          <Area
            yAxisId="right"
            type="monotone"
            dataKey="This Year Revenue"
            stroke="#52c41a"
            fill="#52c41a"
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Area
            yAxisId="right"
            type="monotone"
            dataKey="Last Year Revenue"
            stroke="#bfbfbf"
            fill="none"
            strokeDasharray="4 3"
            strokeWidth={1}
          />
        </AreaChart>
      </ResponsiveContainer>
    </WidgetCard>
  );
}
