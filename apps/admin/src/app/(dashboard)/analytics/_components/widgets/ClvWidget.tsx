'use client';

import { Table, Tag } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useClv } from '@/hooks/useAnalytics';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { WidgetCard } from '../WidgetCard';
import type { ClvEntry } from '@/types/analytics';

const columns: ColumnsType<ClvEntry> = [
  {
    title: 'Client',
    dataIndex: 'displayName',
    key: 'displayName',
    ellipsis: true,
  },
  {
    title: 'Total Spent',
    dataIndex: 'totalSpentCents',
    key: 'totalSpentCents',
    render: (v: number) => formatCurrency(v),
    sorter: (a, b) => a.totalSpentCents - b.totalSpentCents,
    defaultSortOrder: 'descend',
    width: 120,
  },
  {
    title: 'Payments',
    dataIndex: 'paymentCount',
    key: 'paymentCount',
    width: 85,
    sorter: (a, b) => a.paymentCount - b.paymentCount,
  },
  {
    title: 'Segment',
    dataIndex: 'segment',
    key: 'segment',
    width: 90,
    render: (v?: string) => v ? <Tag>{v}</Tag> : '-',
  },
  {
    title: 'Last Payment',
    dataIndex: 'lastPayment',
    key: 'lastPayment',
    render: (v: string) => formatDate(v),
    width: 110,
  },
];

export function ClvWidget(): React.ReactNode {
  const { data, isLoading, error, refetch } = useClv(20);

  return (
    <WidgetCard
      title={<span><TeamOutlined /><span style={{ marginLeft: 8 }}>Customer Lifetime Value</span></span>}
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => void refetch()}
      empty={!data || data.length === 0}
      emptyText="No CLV data"
      minHeight={370}
    >
      <Table<ClvEntry>
        columns={columns}
        dataSource={data ?? []}
        rowKey="userId"
        size="small"
        pagination={{ pageSize: 5, size: 'small', showSizeChanger: false }}
        scroll={{ x: 450 }}
      />
    </WidgetCard>
  );
}
