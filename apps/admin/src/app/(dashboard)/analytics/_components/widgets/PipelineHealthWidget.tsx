'use client';

import { Tag, Table } from 'antd';
import { RiseOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
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
import { formatCurrency } from '@/lib/utils/format';
import { WidgetCard } from '../WidgetCard';
import { useAnalyticsContext } from '../AnalyticsContext';
import type { PipelineStageEntry } from '@/types/analytics';
import React, { useState } from 'react';

const STAGE_COLORS = [
  '#bae0ff', '#91caff', '#69b1ff', '#4096ff',
  '#1677ff', '#52c41a', '#ff4d4f', '#d9d9d9',
];

type ViewMode = 'chart' | 'table';

const tableColumns: ColumnsType<PipelineStageEntry> = [
  { title: 'Stage', dataIndex: 'stageName', key: 'stageName', width: 120 },
  { title: 'Count', dataIndex: 'count', key: 'count', width: 70, sorter: (a, b) => a.count - b.count },
  {
    title: 'Value',
    dataIndex: 'totalValueCents',
    key: 'value',
    width: 110,
    render: (v: number) => formatCurrency(v),
    sorter: (a, b) => a.totalValueCents - b.totalValueCents,
  },
  {
    title: 'Conv %',
    dataIndex: 'conversionRate',
    key: 'conv',
    width: 80,
    render: (v: number) => `${Math.round(v * 100)}%`,
  },
  {
    title: 'Avg Days',
    dataIndex: 'avgDaysInStage',
    key: 'days',
    width: 90,
    render: (v: number) => `${v}d`,
  },
  {
    title: 'Status',
    dataIndex: 'isBottleneck',
    key: 'bottleneck',
    width: 100,
    render: (v: boolean) => v ? <Tag color="red">Bottleneck</Tag> : <Tag color="green">OK</Tag>,
  },
];

export function PipelineHealthWidget(): React.ReactNode {
  const { filters } = useAnalyticsContext();
  const { data, isLoading, error, refetch } = usePipelineHealth(filters);
  const [view, setView] = useState<ViewMode>('chart');

  const chartData = (data ?? []).map((s) => ({
    stage: s.stageName,
    count: s.count,
    isBottleneck: s.isBottleneck,
    conversionRate: `${Math.round(s.conversionRate * 100)}%`,
    avgDays: s.avgDaysInStage,
    value: s.totalValueCents,
  }));

  return (
    <WidgetCard
      title={
        <span>
          <RiseOutlined />
          <span style={{ marginLeft: 8 }}>Pipeline Health</span>
          {data?.some((s) => s.isBottleneck) && (
            <Tag color="red" style={{ marginLeft: 8 }}>Bottleneck</Tag>
          )}
        </span>
      }
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => void refetch()}
      empty={!data || data.length === 0}
      emptyText="No pipeline data"
      minHeight={370}
      extra={
        <span
          style={{ cursor: 'pointer', fontSize: 12, color: '#1677ff' }}
          onClick={() => setView(view === 'chart' ? 'table' : 'chart')}
        >
          {view === 'chart' ? 'Table' : 'Chart'}
        </span>
      }
    >
      {view === 'chart' ? (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="stage" fontSize={10} angle={-20} textAnchor="end" height={55} />
            <YAxis fontSize={11} />
            <Tooltip
              formatter={(value: number) => [value, 'Leads']}
              labelFormatter={(label: string) => {
                const stage = chartData.find((d) => d.stage === label);
                if (!stage) return label;
                return `${label} | Conv: ${stage.conversionRate} | Avg: ${stage.avgDays}d | Value: ${formatCurrency(stage.value)}`;
              }}
            />
            <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.isBottleneck ? '#ff4d4f' : STAGE_COLORS[index % STAGE_COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <Table<PipelineStageEntry>
          columns={tableColumns}
          dataSource={data ?? []}
          rowKey="stage"
          size="small"
          pagination={false}
          scroll={{ x: 500 }}
        />
      )}
    </WidgetCard>
  );
}
