'use client';

import { Card, Tag, Spin, Empty } from 'antd';
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
} from 'recharts';
import { useRevenueForecast } from '@/hooks/useAnalytics';
import { formatCurrency } from '@/lib/utils/format';

export function RevenueForecastWidget(): React.ReactNode {
  const { data, isLoading } = useRevenueForecast();

  if (isLoading) {
    return (
      <Card title={<span><DollarOutlined /> Revenue Forecast</span>} style={{ minHeight: 350 }}>
        <Spin />
      </Card>
    );
  }

  if (!data || (data.historical.length === 0 && data.forecast.length === 0)) {
    return (
      <Card title={<span><DollarOutlined /> Revenue Forecast</span>} style={{ minHeight: 350 }}>
        <Empty description="No revenue data yet" />
      </Card>
    );
  }

  // Combine historical + forecast into single chart dataset
  const chartData = [
    ...data.historical.map((h) => ({
      period: h.period,
      revenue: h.totalCents / 100,
      type: 'actual',
    })),
    ...data.forecast.map((f) => ({
      period: f.quarter,
      forecast: f.predictedCents / 100,
      lower: f.lowerBoundCents / 100,
      upper: f.upperBoundCents / 100,
      type: 'forecast',
    })),
  ];

  return (
    <Card
      title={
        <span>
          <DollarOutlined />
          <span style={{ marginLeft: 8 }}>Revenue Forecast</span>
          {data.isEstimated && (
            <Tag color="orange" style={{ marginLeft: 8 }}>
              Estimated ({data.dataMonths} months data)
            </Tag>
          )}
        </span>
      }
      style={{ minHeight: 350 }}
    >
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" fontSize={11} />
          <YAxis
            fontSize={11}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(value: number) => formatCurrency(value * 100)}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#1677ff"
            strokeWidth={2}
            name="Actual Revenue"
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="upper"
            stroke="none"
            fill="#1677ff"
            fillOpacity={0.1}
            name="Upper Bound"
          />
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="#1677ff"
            strokeWidth={2}
            strokeDasharray="6 3"
            name="Forecast"
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="lower"
            stroke="none"
            fill="#fff"
            fillOpacity={1}
            name="Lower Bound"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}
