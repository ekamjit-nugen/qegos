'use client';

import { useState } from 'react';
import { Table, Tag, Select, Card, Row, Col, Rate } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useReviewList_Rep } from '@/hooks/useReputation';
import type { Review, ReviewListQuery_Rep } from '@/types/reputation';
import { REVIEW_STATUS_LABELS_REP, REVIEW_STATUS_COLORS_REP } from '@/types/reputation';
import { formatDate } from '@/lib/utils/format';

export function ReputationListPage(): React.ReactNode {
  const [filters, setFilters] = useState<ReviewListQuery_Rep>({ page: 1, limit: 20 });
  const { data, isLoading } = useReviewList_Rep(filters);

  const columns: ColumnsType<Review> = [
    {
      title: 'Rating',
      dataIndex: 'rating',
      width: 160,
      render: (val: number) => <Rate disabled defaultValue={val} />,
    },
    {
      title: 'NPS Score',
      dataIndex: 'npsScore',
      width: 100,
      render: (val: number | undefined) => (val !== undefined && val !== null ? val : '-'),
    },
    {
      title: 'Comment',
      dataIndex: 'comment',
      ellipsis: true,
      render: (val: string) => val ?? '-',
    },
    {
      title: 'Tags',
      dataIndex: 'tags',
      width: 180,
      render: (val: string[]) =>
        val && val.length > 0 ? val.map((tag) => <Tag key={tag}>{tag}</Tag>) : '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (val: string) => (
        <Tag color={REVIEW_STATUS_COLORS_REP[val as keyof typeof REVIEW_STATUS_COLORS_REP]}>
          {REVIEW_STATUS_LABELS_REP[val as keyof typeof REVIEW_STATUS_LABELS_REP] ?? val}
        </Tag>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      width: 110,
      render: (val: string) => formatDate(val),
    },
  ];

  const statusOptions = Object.entries(REVIEW_STATUS_LABELS_REP).map(([value, label]) => ({
    value,
    label,
  }));

  const ratingOptions = [
    { value: 1, label: '1+ Stars' },
    { value: 2, label: '2+ Stars' },
    { value: 3, label: '3+ Stars' },
    { value: 4, label: '4+ Stars' },
    { value: 5, label: '5 Stars' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Reputation Management</h2>
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
              placeholder="Min Rating"
              allowClear
              style={{ width: '100%' }}
              options={ratingOptions}
              onChange={(val) => setFilters((f) => ({ ...f, minRating: val, page: 1 }))}
            />
          </Col>
        </Row>
      </Card>

      <Table<Review>
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
