'use client';

import { Tag } from 'antd';
import { DollarOutlined } from '@ant-design/icons';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { useRevenueForecast } from '@/hooks/useAnalytics';
import { formatCurrency } from '@/lib/utils/format';
import { WidgetCard } from '../WidgetCard';
import { useAnalyticsContext } from '../AnalyticsContext';

export function RevenueForecastWidget(): React.ReactNode {
  const { filters } = useAnalyticsContext();
  const { data, isLoading, error, refetch } = useRevenueForecast(filters);

  const isEmpty = !data || (data.historical.length === 0 && data.forecast.length === 0);

  // Combine historical + forecast into single chart dataset
  const chartData = data ? [
    ...data.historical.map((h) => ({
      period: h.period,
      revenue: h.totalCents / 100,
      count: h.count,
    })),
    ...data.forecast.map((f) => ({
      period: f.quarter,
      forecast: f.predictedCents / 100,
      lower: f.lowerBoundCents / 100,
      upper: f.upperBoundCents / 100,
    })),
  ] : [];

  // Find the transition point between historical and forecast
  const transitionIdx = data ? data.historical.length - 1 : -1;
  const transitionPeriod = transitionIdx >= 0 ? chartData[transitionIdx]?.period : undefined;

  return (
    <WidgetCard
      title={
        <span>
          <DollarOutlined />
          <span style={{ marginLeft: 8 }}>Revenue Forecast</span>
          {data?.isEstimated && (
            <Tag color="orange" style={{ marginLeft: 8 }}>
              Estimated ({data.dataMonths}mo data)
            </Tag>
          )}
        </span>
      }
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => void refetch()}
      empty={isEmpty}
      emptyText="No revenue data yet"
      minHeight={370}
    >
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="period" fontSize={11} tickMargin={4} />
          <YAxis
            fontSize={11}
            tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
          />
          <Tooltip
            formatter={(value: number, name: string) => [formatCurrency(value * 100), name]}
            labelStyle={{ fontWeight: 600 }}
          />
          <Legend />
          {transitionPeriod && (
            <ReferenceLine x={transitionPeriod} stroke="#d9d9d9" strokeDasharray="4 4" label="" />
          )}
          <Area
            type="monotone"
            dataKey="upper"
            stroke="none"
            fill="#1677ff"
            fillOpacity={0.08}
            name="Confidence Range"
          />
          <Area
            type="monotone"
            dataKey="lower"
            stroke="none"
            fill="#fff"
            fillOpacity={1}
            name=""
            legendType="none"
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#1677ff"
            strokeWidth={2}
            name="Actual Revenue"
            dot={{ r: 2 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="#1677ff"
            strokeWidth={2}
            strokeDasharray="6 3"
            name="Forecast"
            dot={{ r: 2, fill: '#fff', stroke: '#1677ff' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </WidgetCard>
  );
}
