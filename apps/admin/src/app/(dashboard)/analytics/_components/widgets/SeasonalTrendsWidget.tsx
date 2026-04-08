'use client';

import { Card, Spin, Empty } from 'antd';
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

export function SeasonalTrendsWidget(): React.ReactNode {
  const { data, isLoading } = useSeasonalTrends('month');

  if (isLoading) {
    return (
      <Card title={<span><CalendarOutlined /> Seasonal Trends</span>} style={{ minHeight: 350 }}>
        <Spin />
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card title={<span><CalendarOutlined /> Seasonal Trends</span>} style={{ minHeight: 350 }}>
        <Empty description="No seasonal data" />
      </Card>
    );
  }

  const chartData = data.map((s) => ({
    period: s.period,
    'This Year': s.orderCount,
    'Last Year': s.previousYearOrderCount ?? 0,
  }));

  return (
    <Card
      title={<span><CalendarOutlined /><span style={{ marginLeft: 8 }}>Seasonal Trends</span></span>}
      style={{ minHeight: 350 }}
    >
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip />
          <Legend />
          <Area
            type="monotone"
            dataKey="This Year"
            stroke="#1677ff"
            fill="#1677ff"
            fillOpacity={0.3}
          />
          <Area
            type="monotone"
            dataKey="Last Year"
            stroke="#8c8c8c"
            fill="#8c8c8c"
            fillOpacity={0.15}
            strokeDasharray="4 3"
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}
