'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Table, Tag, Button, Input, Select, Card, Row, Col, Progress } from 'antd';
import { PlusOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useOrderList } from '@/hooks/useOrders';
import type { Order, OrderListQuery } from '@/types/order';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/types/order';
import { formatCurrency, formatDate, fullName } from '@/lib/utils/format';
import { getFinancialYears } from '@/lib/utils/constants';

export function OrderListPage(): React.ReactNode {
  const router = useRouter();
  const [filters, setFilters] = useState<OrderListQuery>({ page: 1, limit: 20 });
  const { data, isLoading } = useOrderList(filters);

  const columns: ColumnsType<Order> = [
    {
      title: 'Order #',
      dataIndex: 'orderNumber',
      width: 130,
      render: (val: string, record: Order) => (
        <a onClick={() => router.push(`/orders/${record._id}`)}>{val}</a>
      ),
    },
    {
      title: 'Client',
      key: 'client',
      render: (_: unknown, record: Order) =>
        fullName(record.personalDetails?.firstName, record.personalDetails?.lastName),
    },
    {
      title: 'Financial Year',
      dataIndex: 'financialYear',
      width: 120,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (val: number) => (
        <Tag color={ORDER_STATUS_COLORS[val]}>{ORDER_STATUS_LABELS[val]}</Tag>
      ),
    },
    {
      title: 'Progress',
      dataIndex: 'completionPercent',
      width: 120,
      render: (val: number) => <Progress percent={val} size="small" />,
    },
    {
      title: 'Total',
      dataIndex: 'finalAmount',
      render: (val: number) => formatCurrency(val),
      sorter: true,
      width: 120,
    },
    {
      title: 'Processing By',
      dataIndex: 'processingByName',
      render: (val: string) => val ?? '-',
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      render: (val: string) => formatDate(val),
      sorter: true,
      width: 110,
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, record: Order) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => router.push(`/orders/${record._id}`)}
        />
      ),
    },
  ];

  const statusOptions = Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => ({
    value: Number(value),
    label,
  }));

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Orders</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push('/orders?action=create')}>
          New Order
        </Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8}>
            <Input
              placeholder="Search orders..."
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
              placeholder="Financial Year"
              allowClear
              style={{ width: '100%' }}
              options={getFinancialYears().map((y) => ({ value: y, label: y }))}
              onChange={(val) => setFilters((f) => ({ ...f, financialYear: val, page: 1 }))}
            />
          </Col>
        </Row>
      </Card>

      <Table<Order>
        columns={columns}
        dataSource={data?.data ?? []}
        rowKey="_id"
        loading={isLoading}
        pagination={{
          current: filters.page,
          pageSize: filters.limit,
          total: data?.meta?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${total} orders`,
          onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, limit: pageSize })),
        }}
      />
    </div>
  );
}
