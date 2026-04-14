'use client';

import { useState } from 'react';
import {
  Table, Tag, Select, Card, Row, Col, Input, DatePicker, Typography,
  Tooltip, Space, Statistic, Badge,
} from 'antd';
import {
  SearchOutlined, WarningOutlined, ExclamationCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAuditLogList, useAuditStats } from '@/hooks/useAuditLogs';
import type { AuditLog, AuditLogQuery, AuditSeverity } from '@/types/auditLog';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_SEVERITY_COLORS,
  AUDIT_ACTOR_TYPE_LABELS,
  AUDIT_ACTOR_TYPE_COLORS,
  AUDIT_RESOURCE_OPTIONS,
} from '@/types/auditLog';
import { formatDateTime } from '@/lib/utils/format';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const SEVERITY_ICONS: Record<AuditSeverity, React.ReactNode> = {
  info: <InfoCircleOutlined />,
  warning: <WarningOutlined />,
  critical: <ExclamationCircleOutlined />,
};

function getActorName(actor: AuditLog['actor']): string {
  if (!actor) return 'System';
  if (typeof actor === 'string') return actor;
  const parts: string[] = [];
  if (actor.firstName) parts.push(actor.firstName);
  if (actor.lastName) parts.push(actor.lastName);
  return parts.length > 0 ? parts.join(' ') : actor.email ?? actor._id;
}

export function AuditLogListPage(): React.ReactNode {
  const [filters, setFilters] = useState<AuditLogQuery>({ page: 1, limit: 20 });
  const { data, isLoading } = useAuditLogList(filters);
  const { data: statsData } = useAuditStats();

  const stats = statsData?.data;

  const columns: ColumnsType<AuditLog> = [
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      width: 170,
      render: (val: string) => (
        <Tooltip title={dayjs(val).format('YYYY-MM-DD HH:mm:ss.SSS')}>
          {formatDateTime(val)}
        </Tooltip>
      ),
    },
    {
      title: 'Severity',
      dataIndex: 'severity',
      width: 90,
      align: 'center',
      render: (val: AuditSeverity) => (
        <Tag
          color={AUDIT_SEVERITY_COLORS[val] ?? 'default'}
          icon={SEVERITY_ICONS[val]}
        >
          {val.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Actor',
      dataIndex: 'actor',
      width: 150,
      render: (actor: AuditLog['actor'], record: AuditLog) => (
        <Tooltip title={`Type: ${AUDIT_ACTOR_TYPE_LABELS[record.actorType] ?? record.actorType}`}>
          <Tag color={AUDIT_ACTOR_TYPE_COLORS[record.actorType] ?? 'default'}>
            {getActorName(actor)}
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      width: 130,
      render: (val: string) => (
        <Tag>{AUDIT_ACTION_LABELS[val] ?? val}</Tag>
      ),
    },
    {
      title: 'Resource',
      dataIndex: 'resource',
      width: 140,
      render: (val: string, record: AuditLog) => (
        <Tooltip title={`ID: ${record.resourceId}${record.resourceNumber ? ` (${record.resourceNumber})` : ''}`}>
          <Text>{val}{record.resourceNumber ? ` #${record.resourceNumber}` : ''}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      ellipsis: true,
      render: (val: string) => val || '-',
    },
    {
      title: 'IP / Path',
      key: 'metadata',
      width: 140,
      ellipsis: true,
      render: (_: unknown, record: AuditLog) => {
        if (!record.metadata) return '-';
        return (
          <Tooltip title={`${record.metadata.requestMethod ?? ''} ${record.metadata.requestPath ?? ''}`}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.metadata.ipAddress ?? '-'}
            </Text>
          </Tooltip>
        );
      },
    },
  ];

  const actionOptions = Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const severityOptions: Array<{ value: AuditSeverity; label: string }> = [
    { value: 'info', label: 'Info' },
    { value: 'warning', label: 'Warning' },
    { value: 'critical', label: 'Critical' },
  ];

  const actorTypeOptions = Object.entries(AUDIT_ACTOR_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={3} style={{ margin: 0 }}>Audit Logs</Title>
      </div>

      {/* Stats Cards */}
      {stats && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title="Critical (30d)"
                value={stats.criticalCount ?? 0}
                valueStyle={{ color: '#cf1322' }}
                prefix={<ExclamationCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title="Failed Logins (30d)"
                value={stats.failedLogins ?? 0}
                valueStyle={{ color: '#fa8c16' }}
                prefix={<WarningOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title="Top Actors"
                value={stats.topActors?.length ?? 0}
                prefix={<InfoCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title="Total Logs"
                value={data?.meta?.total ?? 0}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Filters */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={6}>
            <Input
              placeholder="Search descriptions..."
              prefix={<SearchOutlined />}
              allowClear
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value || undefined, page: 1 }))}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="Action"
              allowClear
              style={{ width: '100%' }}
              options={actionOptions}
              onChange={(val) => setFilters((f) => ({ ...f, action: val, page: 1 }))}
            />
          </Col>
          <Col xs={12} sm={3}>
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
              showSearch
              style={{ width: '100%' }}
              options={AUDIT_RESOURCE_OPTIONS}
              onChange={(val) => setFilters((f) => ({ ...f, resource: val, page: 1 }))}
            />
          </Col>
          <Col xs={12} sm={3}>
            <Select
              placeholder="Actor Type"
              allowClear
              style={{ width: '100%' }}
              options={actorTypeOptions}
              onChange={(val) => setFilters((f) => ({ ...f, actorType: val, page: 1 }))}
            />
          </Col>
          <Col xs={24} sm={4}>
            <RangePicker
              style={{ width: '100%' }}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setFilters((f) => ({
                    ...f,
                    dateFrom: dates[0]!.startOf('day').toISOString(),
                    dateTo: dates[1]!.endOf('day').toISOString(),
                    page: 1,
                  }));
                } else {
                  setFilters((f) => ({
                    ...f,
                    dateFrom: undefined,
                    dateTo: undefined,
                    page: 1,
                  }));
                }
              }}
            />
          </Col>
        </Row>
      </Card>

      <Table<AuditLog>
        columns={columns}
        dataSource={data?.data ?? []}
        rowKey="_id"
        loading={isLoading}
        size="small"
        expandable={{
          expandedRowRender: (record) => (
            <div style={{ padding: '8px 0' }}>
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <div>
                  <Text strong>Resource ID: </Text>
                  <Text copyable={{ text: record.resourceId }}>{record.resourceId}</Text>
                </div>
                {record.resourceNumber && (
                  <div>
                    <Text strong>Resource #: </Text>
                    <Text>{record.resourceNumber}</Text>
                  </div>
                )}
                {record.metadata && (
                  <div>
                    <Text strong>Request: </Text>
                    <Text code>
                      {record.metadata.requestMethod} {record.metadata.requestPath}
                    </Text>
                    {record.metadata.ipAddress && (
                      <Text type="secondary"> from {record.metadata.ipAddress}</Text>
                    )}
                  </div>
                )}
                {record.metadata?.userAgent && (
                  <div>
                    <Text strong>User Agent: </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{record.metadata.userAgent}</Text>
                  </div>
                )}
                {record.changes && Object.keys(record.changes).length > 0 && (
                  <div>
                    <Text strong>Changes:</Text>
                    <div style={{ marginTop: 4 }}>
                      {Object.entries(record.changes).map(([field, change]) => (
                        <div key={field} style={{ marginLeft: 16, marginBottom: 2 }}>
                          <Text code>{field}</Text>:{' '}
                          <Text delete type="danger">{String(change.from ?? 'null')}</Text>
                          {' → '}
                          <Text type="success">{String(change.to ?? 'null')}</Text>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Space>
            </div>
          ),
          rowExpandable: (record) =>
            !!(record.changes && Object.keys(record.changes).length > 0) ||
            !!record.metadata?.requestPath,
        }}
        pagination={{
          current: filters.page,
          pageSize: filters.limit,
          total: data?.meta?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${total} logs`,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, limit: pageSize })),
        }}
      />
    </div>
  );
}
