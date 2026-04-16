'use client';

import { PieChartOutlined } from '@ant-design/icons';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { useServiceMix } from '@/hooks/useAnalytics';
import { formatCurrency } from '@/lib/utils/format';
import { WidgetCard } from '../WidgetCard';
import { useAnalyticsContext } from '../AnalyticsContext';

const COLORS = [
  '#1677ff',
  '#52c41a',
  '#faad14',
  '#ff4d4f',
  '#722ed1',
  '#13c2c2',
  '#eb2f96',
  '#fa541c',
];

export function ServiceMixWidget(): React.ReactNode {
  const { filters } = useAnalyticsContext();
  const { data, isLoading, error, refetch } = useServiceMix(filters);

  const chartData = (data ?? []).map((s) => ({
    name: s.serviceTitle,
    value: s.revenueCents / 100,
    percent: s.percentOfTotal,
    orders: s.orderCount,
    qty: s.quantity,
  }));

  return (
    <WidgetCard
      title={
        <span>
          <PieChartOutlined />
          <span style={{ marginLeft: 8 }}>Service Mix</span>
        </span>
      }
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => void refetch()}
      empty={!data || data.length === 0}
      emptyText="No service data"
      minHeight={370}
    >
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            outerRadius={95}
            innerRadius={55}
            dataKey="value"
            nameKey="name"
            label={({ name, percent }: { name: string; percent: number }) =>
              `${name.length > 18 ? name.slice(0, 16) + '...' : name} ${percent.toFixed(0)}%`
            }
            labelLine={{ stroke: '#d9d9d9' }}
            fontSize={11}
          >
            {chartData.map((_entry, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number, name: string) => [formatCurrency(v * 100), name]} />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            wrapperStyle={{ fontSize: 11, paddingLeft: 8 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </WidgetCard>
  );
}
