'use client';

import { Card, Spin, Empty, Tag } from 'antd';
import { RiseOutlined } from '@ant-design/icons';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { usePipelineHealth } from '@/hooks/useAnalytics';

const STAGE_COLORS = [
  '#bae0ff', '#91caff', '#69b1ff', '#4096ff',
  '#1677ff', '#52c41a', '#ff4d4f', '#d9d9d9',
];

export function PipelineHealthWidget(): React.ReactNode {
  const { data, isLoading } = usePipelineHealth();

  if (isLoading) {
    return (
      <Card title={<span><RiseOutlined /> Pipeline Health</span>} style={{ minHeight: 350 }}>
        <Spin />
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card title={<span><RiseOutlined /> Pipeline Health</span>} style={{ minHeight: 350 }}>
        <Empty description="No pipeline data" />
      </Card>
    );
  }

  const chartData = data.map((s) => ({
    stage: s.stageName,
    count: s.count,
    isBottleneck: s.isBottleneck,
    conversionRate: `${Math.round(s.conversionRate * 100)}%`,
    avgDays: s.avgDaysInStage,
  }));

  return (
    <Card
      title={
        <span>
          <RiseOutlined />
          <span style={{ marginLeft: 8 }}>Pipeline Health</span>
          {data.some((s) => s.isBottleneck) && (
            <Tag color="red" style={{ marginLeft: 8 }}>Bottleneck Detected</Tag>
          )}
        </span>
      }
      style={{ minHeight: 350 }}
    >
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="stage" fontSize={10} angle={-20} textAnchor="end" height={50} />
          <YAxis fontSize={11} />
          <Tooltip
            formatter={(value: number, name: string) => [value, 'Leads']}
            labelFormatter={(label: string) => {
              const stage = chartData.find((d) => d.stage === label);
              return `${label} | Conv: ${stage?.conversionRate} | Avg: ${stage?.avgDays}d`;
            }}
          />
          <Bar dataKey="count" name="Leads">
            {chartData.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.isBottleneck ? '#ff4d4f' : STAGE_COLORS[index % STAGE_COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
