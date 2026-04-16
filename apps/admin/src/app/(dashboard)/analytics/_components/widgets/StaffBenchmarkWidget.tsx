'use client';

import React, { useState } from 'react';
import { Table, Tag } from 'antd';
import { BarChartOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useStaffBenchmark } from '@/hooks/useAnalytics';
import { WidgetCard } from '../WidgetCard';
import { useAnalyticsContext } from '../AnalyticsContext';
import type { StaffBenchmarkEntry } from '@/types/analytics';

type ViewMode = 'chart' | 'table';

const tableColumns: ColumnsType<StaffBenchmarkEntry> = [
  { title: 'Staff', dataIndex: 'displayName', key: 'name', ellipsis: true },
  {
    title: 'Orders',
    dataIndex: 'ordersCompleted',
    key: 'orders',
    width: 80,
    sorter: (a, b) => a.ordersCompleted - b.ordersCompleted,
    defaultSortOrder: 'descend',
  },
  {
    title: 'Leads',
    dataIndex: 'leadsContacted',
    key: 'leads',
    width: 75,
    sorter: (a, b) => a.leadsContacted - b.leadsContacted,
  },
  {
    title: 'Tickets',
    dataIndex: 'ticketsResolved',
    key: 'tickets',
    width: 80,
    sorter: (a, b) => a.ticketsResolved - b.ticketsResolved,
  },
  {
    title: 'Avg Review',
    dataIndex: 'avgReviewMinutes',
    key: 'review',
    width: 100,
    render: (v: number) => <Tag color={v > 60 ? 'red' : v > 30 ? 'orange' : 'green'}>{v}m</Tag>,
    sorter: (a, b) => a.avgReviewMinutes - b.avgReviewMinutes,
  },
];

export function StaffBenchmarkWidget(): React.ReactNode {
  const { filters } = useAnalyticsContext();
  const { data, isLoading, error, refetch } = useStaffBenchmark(filters);
  const [view, setView] = useState<ViewMode>('chart');

  const chartData = (data ?? []).slice(0, 10).map((s) => ({
    name: s.displayName.split(' ')[0] || s.staffId.slice(-4),
    Orders: s.ordersCompleted,
    Leads: s.leadsContacted,
    Tickets: s.ticketsResolved,
  }));

  return (
    <WidgetCard
      title={
        <span>
          <BarChartOutlined />
          <span style={{ marginLeft: 8 }}>Staff Benchmark</span>
        </span>
      }
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => void refetch()}
      empty={!data || data.length === 0}
      emptyText="No staff data"
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
            <XAxis dataKey="name" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Orders" fill="#1677ff" radius={[2, 2, 0, 0]} />
            <Bar dataKey="Leads" fill="#52c41a" radius={[2, 2, 0, 0]} />
            <Bar dataKey="Tickets" fill="#faad14" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <Table<StaffBenchmarkEntry>
          columns={tableColumns}
          dataSource={data ?? []}
          rowKey="staffId"
          size="small"
          pagination={{ pageSize: 8, size: 'small' }}
          scroll={{ x: 450 }}
        />
      )}
    </WidgetCard>
  );
}
