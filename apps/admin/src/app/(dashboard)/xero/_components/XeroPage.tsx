'use client';

import { useState } from 'react';
import { Table, Tag, Card, Button, Tabs, Descriptions, Select, Row, Col, Badge, message } from 'antd';
import { SyncOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useXeroStatus, useXeroConfig, useXeroSyncLogs, useReconciliation } from '@/hooks/useXero';
import type { XeroSyncLog, SyncLogListQuery, XeroSyncStatus, XeroSyncEntityType } from '@/types/xero';
import { SYNC_STATUS_COLORS, SYNC_ENTITY_LABELS } from '@/types/xero';
import { formatDateTime } from '@/lib/utils/format';

export function XeroPage(): React.ReactNode {
  const [logFilters, setLogFilters] = useState<SyncLogListQuery>({ page: 1, limit: 20 });
  const { data: statusData, isLoading: statusLoading } = useXeroStatus();
  const { data: configData } = useXeroConfig();
  const { data: logsData, isLoading: logsLoading } = useXeroSyncLogs(logFilters);
  const reconciliation = useReconciliation();

  const isConnected = statusData?.connected ?? false;

  const handleReconcile = (): void => {
    reconciliation.mutate(undefined, {
      onSuccess: (result) => {
        void message.success(`Reconciliation complete: ${result.reconciled} reconciled, ${result.mismatches} mismatches`);
      },
    });
  };

  const syncLogColumns: ColumnsType<XeroSyncLog> = [
    {
      title: 'Entity Type',
      dataIndex: 'entityType',
      width: 120,
      render: (val: XeroSyncEntityType) => SYNC_ENTITY_LABELS[val] ?? val,
    },
    {
      title: 'Entity ID',
      dataIndex: 'entityId',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Action',
      dataIndex: 'action',
      width: 100,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 120,
      render: (val: XeroSyncStatus) => (
        <Tag color={SYNC_STATUS_COLORS[val]}>{val}</Tag>
      ),
    },
    {
      title: 'Error',
      dataIndex: 'error',
      ellipsis: true,
      render: (val: string | undefined) => val ?? '-',
    },
    {
      title: 'Retries',
      dataIndex: 'retryCount',
      width: 80,
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      width: 160,
      render: (val: string) => formatDateTime(val),
      sorter: true,
    },
  ];

  const syncStatusOptions: { value: XeroSyncStatus; label: string }[] = [
    { value: 'queued', label: 'Queued' },
    { value: 'processing', label: 'Processing' },
    { value: 'success', label: 'Success' },
    { value: 'failed', label: 'Failed' },
  ];

  const entityTypeOptions = Object.entries(SYNC_ENTITY_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const tabItems = [
    {
      key: 'config',
      label: 'Config',
      children: (
        <Card>
          <Descriptions column={1} bordered>
            <Descriptions.Item label="Tenant ID">
              {configData?.xeroTenantId ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Revenue Account Code">
              {configData?.xeroRevenueAccountCode ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Bank Account ID">
              {configData?.xeroBankAccountId ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label="GST Account Code">
              {configData?.xeroGstAccountCode ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Default Tax Type">
              {configData?.xeroDefaultTaxType ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Last Sync">
              {configData?.lastSyncAt ? formatDateTime(configData.lastSyncAt) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Sync Error Count">
              {configData?.syncErrorCount ?? 0}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      ),
    },
    {
      key: 'sync-logs',
      label: 'Sync Logs',
      children: (
        <div>
          <Card style={{ marginBottom: 16 }}>
            <Row gutter={[12, 12]}>
              <Col xs={12} sm={4}>
                <Select
                  placeholder="Status"
                  allowClear
                  style={{ width: '100%' }}
                  options={syncStatusOptions}
                  onChange={(val) => setLogFilters((f) => ({ ...f, status: val, page: 1 }))}
                />
              </Col>
              <Col xs={12} sm={4}>
                <Select
                  placeholder="Entity Type"
                  allowClear
                  style={{ width: '100%' }}
                  options={entityTypeOptions}
                  onChange={(val) => setLogFilters((f) => ({ ...f, entityType: val, page: 1 }))}
                />
              </Col>
            </Row>
          </Card>

          <Table<XeroSyncLog>
            columns={syncLogColumns}
            dataSource={logsData?.data ?? []}
            rowKey="_id"
            loading={logsLoading}
            pagination={{
              current: logFilters.page,
              pageSize: logFilters.limit,
              total: logsData?.meta?.total ?? 0,
              showSizeChanger: true,
              showTotal: (total) => `${total} logs`,
              onChange: (page, pageSize) => setLogFilters((f) => ({ ...f, page, limit: pageSize })),
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Xero Integration</h2>
        <Button
          icon={<SyncOutlined />}
          loading={reconciliation.isPending}
          onClick={handleReconcile}
          disabled={!isConnected}
        >
          Run Reconciliation
        </Button>
      </div>

      <Card style={{ marginBottom: 16 }} loading={statusLoading}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Badge
            status={isConnected ? 'success' : 'error'}
            text={
              <span style={{ fontSize: 16, fontWeight: 500 }}>
                {isConnected ? (
                  <>
                    <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                    Connected to Xero
                  </>
                ) : (
                  <>
                    <CloseCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
                    Not Connected
                  </>
                )}
              </span>
            }
          />
        </div>
      </Card>

      <Tabs items={tabItems} defaultActiveKey="config" />
    </div>
  );
}
