'use client';

import { useState } from 'react';
import { Table, Tag, Input, Select, Card, Row, Col } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useTicketList } from '@/hooks/useTickets';
import type { SupportTicket, TicketListQuery } from '@/types/ticket';
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
  TICKET_CATEGORY_LABELS,
} from '@/types/ticket';
import { formatDate } from '@/lib/utils/format';

export function TicketListPage(): React.ReactNode {
  const [filters, setFilters] = useState<TicketListQuery>({ page: 1, limit: 20 });
  const { data, isLoading } = useTicketList(filters);

  const columns: ColumnsType<SupportTicket> = [
    {
      title: 'Ticket #',
      dataIndex: 'ticketNumber',
      width: 120,
    },
    {
      title: 'Subject',
      dataIndex: 'subject',
      ellipsis: true,
    },
    {
      title: 'Category',
      dataIndex: 'category',
      width: 120,
      render: (val: string) =>
        TICKET_CATEGORY_LABELS[val as keyof typeof TICKET_CATEGORY_LABELS] ?? val,
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      width: 100,
      render: (val: string) => (
        <Tag color={TICKET_PRIORITY_COLORS[val as keyof typeof TICKET_PRIORITY_COLORS]}>
          {TICKET_PRIORITY_LABELS[val as keyof typeof TICKET_PRIORITY_LABELS] ?? val}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 140,
      render: (val: string) => (
        <Tag color={TICKET_STATUS_COLORS[val as keyof typeof TICKET_STATUS_COLORS]}>
          {TICKET_STATUS_LABELS[val as keyof typeof TICKET_STATUS_LABELS] ?? val}
        </Tag>
      ),
    },
    {
      title: 'SLA Breached',
      dataIndex: 'slaBreached',
      width: 110,
      render: (val: boolean) => (val ? <Tag color="red">Yes</Tag> : <Tag>No</Tag>),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      width: 110,
      render: (val: string) => formatDate(val),
    },
  ];

  const statusOptions = Object.entries(TICKET_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const priorityOptions = Object.entries(TICKET_PRIORITY_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const categoryOptions = Object.entries(TICKET_CATEGORY_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Support Tickets</h2>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8}>
            <Input
              placeholder="Search tickets..."
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
              placeholder="Priority"
              allowClear
              style={{ width: '100%' }}
              options={priorityOptions}
              onChange={(val) => setFilters((f) => ({ ...f, priority: val, page: 1 }))}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="Category"
              allowClear
              style={{ width: '100%' }}
              options={categoryOptions}
              onChange={(val) => setFilters((f) => ({ ...f, category: val, page: 1 }))}
            />
          </Col>
        </Row>
      </Card>

      <Table<SupportTicket>
        columns={columns}
        dataSource={data?.data ?? []}
        rowKey="_id"
        loading={isLoading}
        pagination={{
          current: filters.page,
          pageSize: filters.limit,
          total: data?.meta?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${total} tickets`,
          onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, limit: pageSize })),
        }}
      />
    </div>
  );
}
