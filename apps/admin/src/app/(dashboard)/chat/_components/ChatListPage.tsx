'use client';

import { useState } from 'react';
import { Table, Tag, Select, Card, Row, Col } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useConversationList } from '@/hooks/useChat';
import type { Conversation, ConversationListQuery } from '@/types/chat';
import { CONVERSATION_STATUS_LABELS, CONVERSATION_STATUS_COLORS } from '@/types/chat';
import { formatDate } from '@/lib/utils/format';

export function ChatListPage(): React.ReactNode {
  const [filters, setFilters] = useState<ConversationListQuery>({ page: 1, limit: 20 });
  const { data, isLoading } = useConversationList(filters);

  const columns: ColumnsType<Conversation> = [
    {
      title: 'Subject',
      dataIndex: 'subject',
      ellipsis: true,
      render: (val: string) => val ?? '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (val: string) => (
        <Tag color={CONVERSATION_STATUS_COLORS[val as keyof typeof CONVERSATION_STATUS_COLORS]}>
          {CONVERSATION_STATUS_LABELS[val as keyof typeof CONVERSATION_STATUS_LABELS] ?? val}
        </Tag>
      ),
    },
    {
      title: 'Unread',
      dataIndex: 'unreadCountStaff',
      width: 80,
      render: (val: number) => (val > 0 ? <Tag color="red">{val}</Tag> : 0),
    },
    {
      title: 'Last Message',
      dataIndex: 'lastMessagePreview',
      ellipsis: true,
      render: (val: string) => val ?? '-',
    },
    {
      title: 'Last Active',
      dataIndex: 'lastMessageAt',
      width: 130,
      render: (val: string) => formatDate(val),
    },
  ];

  const statusOptions = Object.entries(CONVERSATION_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Chat Conversations</h2>
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
        </Row>
      </Card>

      <Table<Conversation>
        columns={columns}
        dataSource={data?.data ?? []}
        rowKey="_id"
        loading={isLoading}
        pagination={{
          current: filters.page,
          pageSize: filters.limit,
          total: data?.meta?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${total} conversations`,
          onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, limit: pageSize })),
        }}
      />
    </div>
  );
}
