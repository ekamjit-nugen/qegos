'use client';

import { Card, Table, Spin, Empty } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useClv } from '@/hooks/useAnalytics';
import { formatCurrency, formatDate } from '@/lib/utils/format';
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
  },
  {
    title: 'Payments',
    dataIndex: 'paymentCount',
    key: 'paymentCount',
    width: 90,
  },
  {
    title: 'Last Payment',
    dataIndex: 'lastPayment',
    key: 'lastPayment',
    render: (v: string) => formatDate(v),
    width: 120,
  },
];

export function ClvWidget(): React.ReactNode {
  const { data, isLoading } = useClv(20);

  return (
    <Card
      title={<span><TeamOutlined /><span style={{ marginLeft: 8 }}>Customer Lifetime Value</span></span>}
      style={{ minHeight: 350 }}
    >
      {isLoading ? (
        <Spin />
      ) : !data || data.length === 0 ? (
        <Empty description="No CLV data" />
      ) : (
        <Table<ClvEntry>
          columns={columns}
          dataSource={data}
          rowKey="userId"
          size="small"
          pagination={{ pageSize: 5, size: 'small' }}
          scroll={{ x: 400 }}
        />
      )}
    </Card>
  );
}
