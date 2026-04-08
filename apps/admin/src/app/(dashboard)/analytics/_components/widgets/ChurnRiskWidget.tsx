'use client';

import { Card, Table, Tag, Spin, Empty } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useChurnRisk } from '@/hooks/useAnalytics';
import { formatCurrency } from '@/lib/utils/format';
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
    width: 100,
  },
  {
    title: 'Days Inactive',
    dataIndex: 'daysSinceLastOrder',
    key: 'daysSinceLastOrder',
    width: 110,
    render: (days: number) => (
      <Tag color={days > 365 ? 'red' : days > 180 ? 'orange' : 'default'}>
        {days}d
      </Tag>
    ),
    sorter: (a, b) => a.daysSinceLastOrder - b.daysSinceLastOrder,
  },
];

export function ChurnRiskWidget(): React.ReactNode {
  const { data, isLoading } = useChurnRisk();

  return (
    <Card
      title={
        <span>
          <WarningOutlined style={{ color: '#ff4d4f' }} />
          <span style={{ marginLeft: 8 }}>Churn Risk</span>
          {data && data.length > 0 && (
            <Tag color="red" style={{ marginLeft: 8 }}>{data.length}</Tag>
          )}
        </span>
      }
      style={{ minHeight: 350 }}
    >
      {isLoading ? (
        <Spin />
      ) : !data || data.length === 0 ? (
        <Empty description="No at-risk clients" />
      ) : (
        <Table<ChurnRiskEntry>
          columns={columns}
          dataSource={data}
          rowKey="userId"
          size="small"
          pagination={{ pageSize: 5, size: 'small' }}
        />
      )}
    </Card>
  );
}
