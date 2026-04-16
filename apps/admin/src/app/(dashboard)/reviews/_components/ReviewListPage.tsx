'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Table, Tag, Select, Card, Row, Col, Button } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useReviewList } from '@/hooks/useReviews';
import type { ReviewAssignment, ReviewListQuery, ReviewStatus } from '@/types/review';
import { REVIEW_STATUSES, REVIEW_STATUS_LABELS, REVIEW_STATUS_COLORS } from '@/types/review';
import { formatDate } from '@/lib/utils/format';

export function ReviewListPage(): React.ReactNode {
  const router = useRouter();
  const [filters, setFilters] = useState<ReviewListQuery>({ page: 1, limit: 20 });
  const { data, isLoading } = useReviewList(filters);

  const columns: ColumnsType<ReviewAssignment> = [
    {
      title: 'Order ID',
      dataIndex: 'orderId',
      render: (val: string) => <a onClick={() => router.push(`/orders/${val}`)}>{val}</a>,
    },
    {
      title: 'Preparer',
      dataIndex: 'preparerId',
      render: (val: string) => val ?? '-',
    },
    {
      title: 'Reviewer',
      dataIndex: 'reviewerId',
      render: (val: string) => val ?? '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (val: ReviewStatus) => (
        <Tag color={REVIEW_STATUS_COLORS[val]}>{REVIEW_STATUS_LABELS[val]}</Tag>
      ),
    },
    {
      title: 'Round',
      dataIndex: 'reviewRound',
      width: 80,
      render: (val: number) => val ?? '-',
    },
    {
      title: 'Changes Requested',
      key: 'changesCount',
      width: 160,
      render: (_: unknown, record: ReviewAssignment) => record.changesRequested?.length ?? 0,
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
      render: (_: unknown, record: ReviewAssignment) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => router.push(`/reviews/${record._id}`)}
        />
      ),
    },
  ];

  const statusOptions = REVIEW_STATUSES.map((s) => ({
    value: s,
    label: REVIEW_STATUS_LABELS[s],
  }));

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Review Pipeline</h2>
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

      <Table<ReviewAssignment>
        columns={columns}
        dataSource={data?.data ?? []}
        rowKey="_id"
        loading={isLoading}
        pagination={{
          current: filters.page,
          pageSize: filters.limit,
          total: data?.meta?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${total} reviews`,
          onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, limit: pageSize })),
        }}
      />
    </div>
  );
}
