'use client';

import { useState } from 'react';
import { Table, Tag, Select, Card, Row, Col, Space, Button } from 'antd';
import { PlusOutlined, FileTextOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCampaignList } from '@/hooks/useBroadcasts';
import type { Campaign, CampaignChannel, CampaignListQuery } from '@/types/broadcast';
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_COLORS,
  CHANNEL_LABELS,
  CHANNEL_COLORS,
} from '@/types/broadcast';
import { formatDate } from '@/lib/utils/format';

export function BroadcastListPage(): React.ReactNode {
  const router = useRouter();
  const [filters, setFilters] = useState<CampaignListQuery>({ page: 1, limit: 20 });
  const { data, isLoading } = useCampaignList(filters);

  const columns: ColumnsType<Campaign> = [
    {
      title: 'Name',
      dataIndex: 'name',
      ellipsis: true,
      render: (name: string, row) => <Link href={`/broadcasts/${row._id}`}>{name}</Link>,
    },
    {
      title: 'Channel',
      dataIndex: 'channel',
      width: 120,
      render: (val: CampaignChannel) => (
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
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h2 style={{ margin: 0 }}>Broadcast Campaigns</h2>
        <Space>
          <Link href="/broadcasts/templates">
            <Button icon={<FileTextOutlined />}>Templates</Button>
          </Link>
          <Link href="/broadcasts/new">
            <Button type="primary" icon={<PlusOutlined />}>
              New Campaign
            </Button>
          </Link>
        </Space>
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
        onRow={(row) => ({
          onClick: (e) => {
            if ((e.target as HTMLElement).closest('a')) return;
            router.push(`/broadcasts/${row._id}`);
          },
          style: { cursor: 'pointer' },
        })}
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
