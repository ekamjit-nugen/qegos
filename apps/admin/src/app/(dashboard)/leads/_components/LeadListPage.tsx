'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Table, Tag, Button, Input, Select, Card, Row, Col } from 'antd';
import { PlusOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useLeadList } from '@/hooks/useLeads';
import type { Lead, LeadListQuery } from '@/types/lead';
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  LEAD_PRIORITY_COLORS,
} from '@/types/lead';
import { formatDate, formatPhone, fullName } from '@/lib/utils/format';
import { LeadFormModal } from './LeadFormModal';

export function LeadListPage(): React.ReactNode {
  const router = useRouter();
  const [filters, setFilters] = useState<LeadListQuery>({ page: 1, limit: 20 });
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading } = useLeadList(filters);

  const columns: ColumnsType<Lead> = [
    {
      title: 'Lead #',
      dataIndex: 'leadNumber',
      width: 120,
      render: (val: string, record: Lead) => (
        <a onClick={() => router.push(`/leads/${record._id}`)}>{val}</a>
      ),
    },
    {
      title: 'Name',
      key: 'name',
      render: (_: unknown, record: Lead) => fullName(record.firstName, record.lastName),
    },
    {
      title: 'Mobile',
      dataIndex: 'mobile',
      render: (val: string) => formatPhone(val),
    },
    {
      title: 'Source',
      dataIndex: 'source',
      render: (val: string) => LEAD_SOURCE_LABELS[val] ?? val,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (val: number) => (
        <Tag color={LEAD_STATUS_COLORS[val]}>{LEAD_STATUS_LABELS[val]}</Tag>
      ),
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      render: (val: string) => (
        <Tag color={LEAD_PRIORITY_COLORS[val]}>{val?.toUpperCase()}</Tag>
      ),
    },
    {
      title: 'Score',
      dataIndex: 'score',
      sorter: true,
      width: 80,
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      render: (val: string) => formatDate(val),
      sorter: true,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      render: (_: unknown, record: Lead) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => router.push(`/leads/${record._id}`)}
        />
      ),
    },
  ];

  const statusOptions = Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => ({
    value: Number(value),
    label,
  }));

  const sourceOptions = LEAD_SOURCES.map((s) => ({
    value: s,
    label: LEAD_SOURCE_LABELS[s],
  }));

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Leads</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowCreate(true)}>
          New Lead
        </Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8}>
            <Input
              placeholder="Search leads..."
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
              options={[
                { value: 'hot', label: 'Hot' },
                { value: 'warm', label: 'Warm' },
                { value: 'cold', label: 'Cold' },
              ]}
              onChange={(val) => setFilters((f) => ({ ...f, priority: val, page: 1 }))}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="Source"
              allowClear
              style={{ width: '100%' }}
              options={sourceOptions}
              onChange={(val) => setFilters((f) => ({ ...f, source: val, page: 1 }))}
            />
          </Col>
        </Row>
      </Card>

      <Table<Lead>
        columns={columns}
        dataSource={data?.data ?? []}
        rowKey="_id"
        loading={isLoading}
        pagination={{
          current: filters.page,
          pageSize: filters.limit,
          total: data?.meta?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${total} leads`,
          onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, limit: pageSize })),
        }}
        onChange={(_pagination, _filters, sorter) => {
          if (!Array.isArray(sorter) && sorter.field) {
            setFilters((f) => ({
              ...f,
              sortBy: String(sorter.field),
              sortOrder: sorter.order === 'ascend' ? 'asc' : 'desc',
            }));
          }
        }}
      />

      <LeadFormModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
