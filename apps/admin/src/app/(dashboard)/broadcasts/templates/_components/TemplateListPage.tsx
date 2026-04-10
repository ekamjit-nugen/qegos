'use client';

import { useState } from 'react';
import {
  Table,
  Tag,
  Select,
  Card,
  Row,
  Col,
  Button,
  Space,
  App,
  Popconfirm,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useTemplateList, useDeleteTemplate } from '@/hooks/useBroadcasts';
import {
  CHANNEL_LABELS,
  CHANNEL_COLORS,
  TEMPLATE_CATEGORY_LABELS,
} from '@/types/broadcast';
import type {
  BroadcastTemplate,
  SingleChannel,
  TemplateCategory,
  TemplateListQuery,
} from '@/types/broadcast';
import { formatDateTime } from '@/lib/utils/format';
import { TemplateEditor } from './TemplateEditor';

const SINGLE_CHANNELS: SingleChannel[] = ['sms', 'email', 'whatsapp'];

export function TemplateListPage(): React.ReactNode {
  const [filters, setFilters] = useState<TemplateListQuery>({ page: 1, limit: 20 });
  const [editing, setEditing] = useState<BroadcastTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useTemplateList(filters);
  const deleteTemplate = useDeleteTemplate();
  const { message } = App.useApp();

  const handleDelete = (id: string): void => {
    deleteTemplate.mutate(id, {
      onSuccess: () => {
        void message.success('Template deactivated');
      },
      onError: () => {
        void message.error('Failed to deactivate template');
      },
    });
  };

  const columns: ColumnsType<BroadcastTemplate> = [
    {
      title: 'Name',
      dataIndex: 'name',
      ellipsis: true,
      render: (name: string, row) => (
        <a onClick={() => setEditing(row)}>{name}</a>
      ),
    },
    {
      title: 'Channel',
      dataIndex: 'channel',
      width: 110,
      render: (val: SingleChannel) => (
        <Tag color={CHANNEL_COLORS[val]}>{CHANNEL_LABELS[val] ?? val}</Tag>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      width: 150,
      render: (val: TemplateCategory) => TEMPLATE_CATEGORY_LABELS[val] ?? val,
    },
    {
      title: 'Subject / Body preview',
      key: 'preview',
      ellipsis: true,
      render: (_: unknown, row) => (
        <span style={{ color: '#666' }}>
          {row.channel === 'email' && row.subject ? `${row.subject} — ` : ''}
          {row.body.slice(0, 80)}
          {row.body.length > 80 ? '…' : ''}
        </span>
      ),
    },
    {
      title: 'Used',
      dataIndex: 'usageCount',
      width: 80,
      align: 'right',
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      width: 90,
      render: (active: boolean) =>
        active ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>,
    },
    {
      title: 'Updated',
      dataIndex: 'updatedAt',
      width: 160,
      render: (val: string) => formatDateTime(val),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 110,
      render: (_: unknown, row) => (
        <Space size="small">
          <Tooltip title="Edit">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => setEditing(row)}
            />
          </Tooltip>
          {row.isActive && (
            <Popconfirm
              title="Deactivate this template?"
              description="Existing campaigns that reference it will continue to work."
              onConfirm={() => handleDelete(row._id)}
              okText="Deactivate"
              cancelText="Cancel"
            >
              <Tooltip title="Deactivate">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const channelOptions = SINGLE_CHANNELS.map((c) => ({
    value: c,
    label: CHANNEL_LABELS[c],
  }));

  const categoryOptions = Object.entries(TEMPLATE_CATEGORY_LABELS).map(([value, label]) => ({
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
        <Space>
          <Link href="/broadcasts">
            <Button icon={<ArrowLeftOutlined />}>Campaigns</Button>
          </Link>
          <h2 style={{ margin: 0 }}>Broadcast Templates</h2>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
          New Template
        </Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={12} sm={5}>
            <Select
              placeholder="Channel"
              allowClear
              style={{ width: '100%' }}
              options={channelOptions}
              onChange={(val) => setFilters((f) => ({ ...f, channel: val, page: 1 }))}
            />
          </Col>
          <Col xs={12} sm={5}>
            <Select
              placeholder="Category"
              allowClear
              style={{ width: '100%' }}
              options={categoryOptions}
              onChange={(val) => setFilters((f) => ({ ...f, category: val, page: 1 }))}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="Status"
              allowClear
              style={{ width: '100%' }}
              options={[
                { value: 'true', label: 'Active' },
                { value: 'false', label: 'Inactive' },
              ]}
              onChange={(val) =>
                setFilters((f) => ({
                  ...f,
                  isActive: val === undefined ? undefined : val === 'true',
                  page: 1,
                }))
              }
            />
          </Col>
        </Row>
      </Card>

      <Table<BroadcastTemplate>
        columns={columns}
        dataSource={data?.data ?? []}
        rowKey="_id"
        loading={isLoading}
        pagination={{
          current: filters.page,
          pageSize: filters.limit,
          total: data?.meta?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${total} templates`,
          onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, limit: pageSize })),
        }}
      />

      {(creating || editing) && (
        <TemplateEditor
          template={editing ?? undefined}
          open
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
