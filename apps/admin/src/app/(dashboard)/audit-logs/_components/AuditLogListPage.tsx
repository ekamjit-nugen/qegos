'use client';

import { useState } from 'react';
import { Table, Tag, Select, Card, Row, Col } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useAuditLogList } from '@/hooks/useAuditLogs';
import type { AuditLog, AuditLogQuery } from '@/types/auditLog';
import { AUDIT_ACTION_LABELS } from '@/types/auditLog';
import { formatDateTime } from '@/lib/utils/format';

const ACTOR_TYPE_COLORS: Record<string, string> = {
  user: 'blue',
  staff: 'cyan',
  admin: 'purple',
  system: 'default',
};

const SEVERITY_LABELS: Record<string, string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
};

export function AuditLogListPage(): React.ReactNode {
  const [filters, setFilters] = useState<AuditLogQuery>({ page: 1, limit: 20 });
  const { data, isLoading } = useAuditLogList(filters);

  const columns: ColumnsType<AuditLog> = [
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      width: 170,
      render: (val: string) => formatDateTime(val),
    },
    {
      title: 'Actor Type',
      dataIndex: 'actorType',
      width: 100,
      render: (val: string) => (
        <Tag color={ACTOR_TYPE_COLORS[val] ?? 'default'}>{val}</Tag>
      ),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      width: 180,
      render: (val: string) => AUDIT_ACTION_LABELS[val] ?? val,
    },
    {
      title: 'Resource',
      dataIndex: 'resource',
      width: 120,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      ellipsis: true,
    },
  ];

  const actionOptions = Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const severityOptions = Object.entries(SEVERITY_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const resourceOptions = [
    { value: 'user', label: 'User' },
    { value: 'order', label: 'Order' },
    { value: 'lead', label: 'Lead' },
    { value: 'payment', label: 'Payment' },
    { value: 'document', label: 'Document' },
    { value: 'settings', label: 'Settings' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Audit Logs</h2>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={12} sm={5}>
            <Select
              placeholder="Action"
              allowClear
              style={{ width: '100%' }}
              options={actionOptions}
              onChange={(val) => setFilters((f) => ({ ...f, action: val, page: 1 }))}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="Severity"
              allowClear
              style={{ width: '100%' }}
              options={severityOptions}
              onChange={(val) => setFilters((f) => ({ ...f, severity: val, page: 1 }))}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="Resource"
              allowClear
              style={{ width: '100%' }}
              options={resourceOptions}
              onChange={(val) => setFilters((f) => ({ ...f, resource: val, page: 1 }))}
            />
          </Col>
        </Row>
      </Card>

      <Table<AuditLog>
        columns={columns}
        dataSource={data?.data ?? []}
        rowKey="_id"
        loading={isLoading}
        pagination={{
          current: filters.page,
          pageSize: filters.limit,
          total: data?.meta?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${total} logs`,
          onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, limit: pageSize })),
        }}
      />
    </div>
  );
}
