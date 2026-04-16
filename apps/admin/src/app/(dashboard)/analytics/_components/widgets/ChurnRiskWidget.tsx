'use client';

import { Table, Tag } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useChurnRisk } from '@/hooks/useAnalytics';
import { formatCurrency } from '@/lib/utils/format';
import { WidgetCard } from '../WidgetCard';
import { useAnalyticsContext } from '../AnalyticsContext';
import type { ChurnRiskEntry } from '@/types/analytics';

const columns: ColumnsType<ChurnRiskEntry> = [
  {
    title: 'Client',
    dataIndex: 'displayName',
    key: 'displayName',
    ellipsis: true,
  },
  {
    title: 'Last FY',
    dataIndex: 'lastFinancialYear',
    key: 'lastFinancialYear',
    width: 95,
  },
  {
    title: 'Paid',
    dataIndex: 'totalPaidCents',
    key: 'totalPaidCents',
    width: 100,
    render: (v: number) => formatCurrency(v),
    sorter: (a, b) => a.totalPaidCents - b.totalPaidCents,
  },
  {
    title: 'Inactive',
    dataIndex: 'daysSinceLastOrder',
    key: 'daysSinceLastOrder',
    width: 90,
    render: (days: number) => (
      <Tag color={days > 365 ? 'red' : days > 180 ? 'orange' : 'default'}>{days}d</Tag>
    ),
    sorter: (a, b) => a.daysSinceLastOrder - b.daysSinceLastOrder,
    defaultSortOrder: 'descend',
  },
];

export function ChurnRiskWidget(): React.ReactNode {
  const { financialYear } = useAnalyticsContext();
  const { data, isLoading, error, refetch } = useChurnRisk(financialYear);

  return (
    <WidgetCard
      title={
        <span>
          <WarningOutlined style={{ color: '#ff4d4f' }} />
          <span style={{ marginLeft: 8 }}>Churn Risk</span>
          {data && data.length > 0 && (
            <Tag color="red" style={{ marginLeft: 8 }}>
              {data.length}
            </Tag>
          )}
        </span>
      }
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => void refetch()}
      empty={!data || data.length === 0}
      emptyText="No at-risk clients"
      minHeight={370}
    >
      <Table<ChurnRiskEntry>
        columns={columns}
        dataSource={data ?? []}
        rowKey="userId"
        size="small"
        pagination={{ pageSize: 5, size: 'small', showSizeChanger: false }}
        scroll={{ x: 400 }}
      />
    </WidgetCard>
  );
}
