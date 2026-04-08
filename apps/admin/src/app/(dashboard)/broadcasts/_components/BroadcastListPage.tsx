'use client';

import { useState } from 'react';
import { Table, Tag, Select, Card, Row, Col } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCampaignList } from '@/hooks/useBroadcasts';
import type { Campaign, CampaignListQuery } from '@/types/broadcast';
import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_COLORS } from '@/types/broadcast';
import { formatDate } from '@/lib/utils/format';

const CHANNEL_LABELS: Record<string, string> = {
  sms: 'SMS',
  email: 'Email',
  whatsapp: 'WhatsApp',
  sms_email: 'SMS + Email',
};

const CHANNEL_COLORS: Record<string, string> = {
  sms: 'cyan',
  email: 'blue',
  whatsapp: 'green',
  sms_email: 'purple',
};

export function BroadcastListPage(): React.ReactNode {
  const [filters, setFilters] = useState<CampaignListQuery>({ page: 1, limit: 20 });
  const { data, isLoading } = useCampaignList(filters);

  const columns: ColumnsType<Campaign> = [
    {
      title: 'Name',
      dataIndex: 'name',
      ellipsis: true,
    },
    {
      title: 'Channel',
      dataIndex: 'channel',
      width: 120,
      render: (val: string) => (
        <Tag color={CHANNEL_COLORS[val]}>{CHANNEL_LABELS[val] ?? val}</Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (val: string) => (
        <Tag color={CAMPAIGN_STATUS_COLORS[val as keyof typeof CAMPAIGN_STATUS_COLORS]}>
          {CAMPAIGN_STATUS_LABELS[val as keyof typeof CAMPAIGN_STATUS_LABELS] ?? val}
        </Tag>
      ),
    },
    {
      title: 'Recipients',
      dataIndex: 'totalRecipients',
      width: 100,
      render: (val: number) => val.toLocaleString(),
    },
    {
      title: 'Sent',
      dataIndex: 'sentCount',
      width: 80,
      render: (val: number) => val.toLocaleString(),
    },
    {
      title: 'Failed',
      dataIndex: 'failedCount',
      width: 80,
      render: (val: number) => val.toLocaleString(),
    },
    {
      title: 'Scheduled At',
      dataIndex: 'scheduledAt',
      width: 130,
      render: (val: string) => formatDate(val),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      width: 110,
      render: (val: string) => formatDate(val),
    },
  ];

  const statusOptions = Object.entries(CAMPAIGN_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const channelOptions = Object.entries(CHANNEL_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Broadcast Campaigns</h2>
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
              placeholder="Channel"
              allowClear
              style={{ width: '100%' }}
              options={channelOptions}
              onChange={(val) => setFilters((f) => ({ ...f, channel: val, page: 1 }))}
            />
          </Col>
        </Row>
      </Card>

      <Table<Campaign>
        columns={columns}
        dataSource={data?.data ?? []}
        rowKey="_id"
        loading={isLoading}
        pagination={{
          current: filters.page,
          pageSize: filters.limit,
          total: data?.meta?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${total} campaigns`,
          onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, limit: pageSize })),
        }}
      />
    </div>
  );
}
