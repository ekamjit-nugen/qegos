'use client';

import { Card, Spin, Empty } from 'antd';
import { PieChartOutlined } from '@ant-design/icons';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';
import { useServiceMix } from '@/hooks/useAnalytics';
import { formatCurrency } from '@/lib/utils/format';

const COLORS = ['#1677ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2', '#eb2f96'];

export function ServiceMixWidget(): React.ReactNode {
  const { data, isLoading } = useServiceMix();

  if (isLoading) {
    return (
      <Card title={<span><PieChartOutlined /> Service Mix</span>} style={{ minHeight: 350 }}>
        <Spin />
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card title={<span><PieChartOutlined /> Service Mix</span>} style={{ minHeight: 350 }}>
        <Empty description="No service data" />
      </Card>
    );
  }

  const chartData = data.map((s) => ({
    name: s.serviceTitle,
    value: s.revenueCents / 100,
    percent: s.percentOfTotal,
  }));

  return (
    <Card
      title={<span><PieChartOutlined /><span style={{ marginLeft: 8 }}>Service Mix</span></span>}
      style={{ minHeight: 350 }}
    >
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            outerRadius={90}
            innerRadius={50}
            dataKey="value"
            nameKey="name"
            label={({ name, percent }: { name: string; percent: number }) =>
              `${name.slice(0, 15)} ${percent.toFixed(0)}%`
            }
            labelLine={false}
            fontSize={11}
          >
            {chartData.map((_entry, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => formatCurrency(v * 100)} />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}
