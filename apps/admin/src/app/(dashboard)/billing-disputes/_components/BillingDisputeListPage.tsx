'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Table, Tag, Select, Card, Row, Col } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useBillingDisputeList } from '@/hooks/useBillingDisputes';
import type { BillingDispute, DisputeListQuery, DisputeStatus, DisputeType } from '@/types/billingDispute';
import { DISPUTE_STATUS_LABELS, DISPUTE_STATUS_COLORS, DISPUTE_TYPE_LABELS } from '@/types/billingDispute';
import { formatCurrency, formatDate } from '@/lib/utils/format';

export function BillingDisputeListPage(): React.ReactNode {
  const router = useRouter();
  const [filters, setFilters] = useState<DisputeListQuery>({ page: 1, limit: 20 });
  const { data, isLoading } = useBillingDisputeList(filters);

  const columns: ColumnsType<BillingDispute> = [
    {
      title: 'Order ID',
      dataIndex: 'orderId',
      width: 140,
      render: (val: string) => (
        <a onClick={() => router.push(`/orders/${val}`)}>{val}</a>
      ),
    },
    {
      title: 'Dispute Type',
      dataIndex: 'disputeType',
      width: 170,
      render: (val: DisputeType) => DISPUTE_TYPE_LABELS[val] ?? val,
    },
    {
      title: 'Disputed Amount',
      dataIndex: 'disputedAmount',
      width: 140,
      render: (val: number) => formatCurrency(val),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 150,
      render: (val: DisputeStatus) => (
        <Tag color={DISPUTE_STATUS_COLORS[val]}>{DISPUTE_STATUS_LABELS[val]}</Tag>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      width: 110,
      render: (val: string) => formatDate(val),
      sorter: true,
    },
  ];

  const statusOptions = Object.entries(DISPUTE_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const typeOptions = Object.entries(DISPUTE_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Billing Disputes</h2>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={12} sm={4}>
            <Select
              placeholder="Status"
              allowClear
              style={{ width: '100%' }}
              options={statusOptions}
              onChange={(val) => setFilters((f) => ({ ...f, status: val, page: 1 }))}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="Dispute Type"
              allowClear
              style={{ width: '100%' }}
              options={typeOptions}
              onChange={(val) => setFilters((f) => ({ ...f, disputeType: val, page: 1 }))}
            />
          </Col>
        </Row>
      </Card>

      <Table<BillingDispute>
        columns={columns}
        dataSource={data?.data ?? []}
        rowKey="_id"
        loading={isLoading}
        pagination={{
          current: filters.page,
          pageSize: filters.limit,
          total: data?.meta?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${total} disputes`,
          onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, limit: pageSize })),
        }}
      />
    </div>
  );
}
