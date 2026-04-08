'use client';

import { useState } from 'react';
import { Table, Tag, Select, Card, Row, Col } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useWhatsAppMessages } from '@/hooks/useWhatsApp';
import type { WhatsAppMessage, WhatsAppMessageListQuery } from '@/types/whatsapp';
import { WHATSAPP_STATUS_COLORS } from '@/types/whatsapp';
import { formatDate, formatPhone } from '@/lib/utils/format';

const DIRECTION_COLORS: Record<string, string> = {
  inbound: 'green',
  outbound: 'blue',
};

const DIRECTION_LABELS: Record<string, string> = {
  inbound: 'Inbound',
  outbound: 'Outbound',
};

const STATUS_LABELS: Record<string, string> = {
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed',
};

export function WhatsAppListPage(): React.ReactNode {
  const [filters, setFilters] = useState<WhatsAppMessageListQuery>({ page: 1, limit: 20 });
  const { data, isLoading } = useWhatsAppMessages(filters);

  const columns: ColumnsType<WhatsAppMessage> = [
    {
      title: 'Contact',
      dataIndex: 'contactMobile',
      width: 150,
      render: (val: string) => formatPhone(val),
    },
    {
      title: 'Direction',
      dataIndex: 'direction',
      width: 110,
      render: (val: string) => (
        <Tag color={DIRECTION_COLORS[val]}>{DIRECTION_LABELS[val] ?? val}</Tag>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'messageType',
      width: 100,
    },
    {
      title: 'Content',
      dataIndex: 'content',
      ellipsis: true,
      render: (val: string) => val ?? '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 100,
      render: (val: string) => (
        <Tag color={WHATSAPP_STATUS_COLORS[val as keyof typeof WHATSAPP_STATUS_COLORS]}>
          {STATUS_LABELS[val] ?? val}
        </Tag>
      ),
    },
    {
      title: 'Sent At',
      dataIndex: 'sentAt',
      width: 130,
      render: (val: string) => formatDate(val),
    },
  ];

  const directionOptions = Object.entries(DIRECTION_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const statusOptions = Object.entries(STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>WhatsApp Messages</h2>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={12} sm={4}>
            <Select
              placeholder="Direction"
              allowClear
              style={{ width: '100%' }}
              options={directionOptions}
              onChange={(val) => setFilters((f) => ({ ...f, direction: val, page: 1 }))}
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
        </Row>
      </Card>

      <Table<WhatsAppMessage>
        columns={columns}
        dataSource={data?.data ?? []}
        rowKey="_id"
        loading={isLoading}
        pagination={{
          current: filters.page,
          pageSize: filters.limit,
          total: data?.meta?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${total} messages`,
          onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, limit: pageSize })),
        }}
      />
    </div>
  );
}
