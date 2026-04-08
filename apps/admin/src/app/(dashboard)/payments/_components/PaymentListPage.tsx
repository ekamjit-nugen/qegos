'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Table, Tag, Input, Select, Card, Row, Col } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { usePaymentList } from '@/hooks/usePayments';
import type { Payment, PaymentListQuery, PaymentStatus, PaymentGateway } from '@/types/payment';
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from '@/types/payment';
import { formatCurrency, formatDate } from '@/lib/utils/format';

export function PaymentListPage(): React.ReactNode {
  const router = useRouter();
  const [filters, setFilters] = useState<PaymentListQuery>({ page: 1, limit: 20 });
  const { data, isLoading } = usePaymentList(filters);

  const columns: ColumnsType<Payment> = [
    {
      title: 'Payment #',
      dataIndex: 'paymentNumber',
      width: 140,
      render: (val: string, record: Payment) => (
        <a onClick={() => router.push(`/payments/${record._id}`)}>{val}</a>
      ),
    },
    {
      title: 'Order',
      dataIndex: 'orderId',
      width: 140,
      render: (val: string) => (
        <a onClick={() => router.push(`/orders/${val}`)}>{val}</a>
      ),
    },
    {
      title: 'Gateway',
      dataIndex: 'gateway',
      width: 100,
      render: (val: PaymentGateway) => val?.toUpperCase() ?? '-',
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      width: 120,
      render: (val: number) => formatCurrency(val),
      sorter: true,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 150,
      render: (val: PaymentStatus) => (
        <Tag color={PAYMENT_STATUS_COLORS[val]}>{PAYMENT_STATUS_LABELS[val]}</Tag>
      ),
    },
    {
      title: 'Xero Synced',
      dataIndex: 'xeroSynced',
      width: 110,
      render: (val: boolean) => (
        <Tag color={val ? 'green' : 'default'}>{val ? 'Yes' : 'No'}</Tag>
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

  const statusOptions = Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const gatewayOptions = [
    { value: 'stripe', label: 'Stripe' },
    { value: 'payzoo', label: 'Payzoo' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Payments</h2>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8}>
            <Input
              placeholder="Search payments..."
              prefix={<SearchOutlined />}
              allowClear
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
            />
          </Col>
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
              placeholder="Gateway"
              allowClear
              style={{ width: '100%' }}
              options={gatewayOptions}
              onChange={(val) => setFilters((f) => ({ ...f, gateway: val, page: 1 }))}
            />
          </Col>
        </Row>
      </Card>

      <Table<Payment>
        columns={columns}
        dataSource={data?.data ?? []}
        rowKey="_id"
        loading={isLoading}
        pagination={{
          current: filters.page,
          pageSize: filters.limit,
          total: data?.meta?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${total} payments`,
          onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, limit: pageSize })),
        }}
      />
    </div>
  );
}
