'use client';

import { useState } from 'react';
import { Table, Tag, Input, Select, Card, Row, Col } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useDocumentList } from '@/hooks/useDocuments';
import type { Document, DocumentListQuery } from '@/types/document';
import { DOCUMENT_STATUS_COLORS } from '@/types/document';
import { formatDate } from '@/lib/utils/format';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  signed: 'Signed',
  verified: 'Verified',
};

export function DocumentListPage(): React.ReactNode {
  const [filters, setFilters] = useState<DocumentListQuery>({ page: 1, limit: 20 });
  const { data, isLoading } = useDocumentList(filters);

  const columns: ColumnsType<Document> = [
    {
      title: 'File Name',
      dataIndex: 'fileName',
      ellipsis: true,
    },
    {
      title: 'Order ID',
      dataIndex: 'orderId',
      width: 140,
    },
    {
      title: 'Type',
      dataIndex: 'documentType',
      width: 120,
      render: (val: string) => val ?? '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 100,
      render: (val: string) => (
        <Tag color={DOCUMENT_STATUS_COLORS[val as keyof typeof DOCUMENT_STATUS_COLORS]}>
          {STATUS_LABELS[val] ?? val}
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

  const statusOptions = Object.entries(STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Documents</h2>
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
          <Col xs={24} sm={6}>
            <Input
              placeholder="Order ID"
              allowClear
              onChange={(e) => setFilters((f) => ({ ...f, orderId: e.target.value, page: 1 }))}
            />
          </Col>
        </Row>
      </Card>

      <Table<Document>
        columns={columns}
        dataSource={data?.data ?? []}
        rowKey="_id"
        loading={isLoading}
        pagination={{
          current: filters.page,
          pageSize: filters.limit,
          total: data?.meta?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${total} documents`,
          onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, limit: pageSize })),
        }}
      />
    </div>
  );
}
