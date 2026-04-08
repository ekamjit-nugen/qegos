'use client';

import { useState } from 'react';
import { Table, Tag, Select, Card, Row, Col } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useTaxDeadlineList } from '@/hooks/useTaxCalendar';
import type { TaxDeadline, TaxDeadlineListQuery } from '@/types/taxCalendar';
import { DEADLINE_TYPE_LABELS } from '@/types/taxCalendar';
import { formatDate } from '@/lib/utils/format';
import { getFinancialYears } from '@/lib/utils/constants';

export function TaxCalendarPage(): React.ReactNode {
  const [filters, setFilters] = useState<TaxDeadlineListQuery>({ page: 1, limit: 20 });
  const { data, isLoading } = useTaxDeadlineList(filters);

  const columns: ColumnsType<TaxDeadline> = [
    {
      title: 'Title',
      dataIndex: 'title',
      ellipsis: true,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      width: 150,
      render: (val: string) => (
        <Tag color="blue">
          {DEADLINE_TYPE_LABELS[val as keyof typeof DEADLINE_TYPE_LABELS] ?? val}
        </Tag>
      ),
    },
    {
      title: 'Deadline Date',
      dataIndex: 'deadlineDate',
      width: 130,
      render: (val: string) => formatDate(val),
    },
    {
      title: 'Financial Year',
      dataIndex: 'financialYear',
      width: 120,
    },
    {
      title: 'Applicable To',
      dataIndex: 'applicableTo',
      width: 140,
    },
    {
      title: 'Recurring',
      dataIndex: 'isRecurring',
      width: 100,
      render: (val: boolean) => (val ? <Tag color="blue">Yes</Tag> : <Tag>No</Tag>),
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      width: 80,
      render: (val: boolean) => (val ? <Tag color="green">Yes</Tag> : <Tag color="red">No</Tag>),
    },
  ];

  const typeOptions = Object.entries(DEADLINE_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Tax Calendar</h2>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={12} sm={5}>
            <Select
              placeholder="Type"
              allowClear
              style={{ width: '100%' }}
              options={typeOptions}
              onChange={(val) => setFilters((f) => ({ ...f, type: val, page: 1 }))}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="Financial Year"
              allowClear
              style={{ width: '100%' }}
              options={getFinancialYears().map((y) => ({ value: y, label: y }))}
              onChange={(val) => setFilters((f) => ({ ...f, financialYear: val, page: 1 }))}
            />
          </Col>
        </Row>
      </Card>

      <Table<TaxDeadline>
        columns={columns}
        dataSource={data?.data ?? []}
        rowKey="_id"
        loading={isLoading}
        pagination={{
          current: filters.page,
          pageSize: filters.limit,
          total: data?.meta?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${total} deadlines`,
          onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, limit: pageSize })),
        }}
      />
    </div>
  );
}
