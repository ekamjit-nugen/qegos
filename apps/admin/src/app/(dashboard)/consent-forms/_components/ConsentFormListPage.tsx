'use client';

/**
 * Consent Form — admin list page.
 *
 * Reads from /api/v1/consent-forms/admin (gated by `consent_forms:read`
 * RBAC). The sensitive fields (TFN/ABN/ACN, BSB, account number, DOB)
 * NEVER leave the server as plaintext — the UI only ever sees the
 * last-4 / year projections.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Col, Input, Row, Select, Table, Tag, Typography } from 'antd';
import { EyeOutlined, LockOutlined, SafetyOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAdminConsentFormList } from '@/hooks/useConsentForms';
import type { ConsentFormSubmission, WorkType } from '@/types/consentForm';
import { WORK_TYPES } from '@/types/consentForm';
import { ConsentFormDetailDrawer } from './ConsentFormDetailDrawer';

const { Title, Text } = Typography;

const PAGE_SIZE = 25;

function formatDate(val: string | undefined): string {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleDateString();
  } catch {
    return '—';
  }
}

export function ConsentFormListPage(): React.ReactNode {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState<string | undefined>();
  const [workType, setWorkType] = useState<WorkType | undefined>();
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useAdminConsentFormList({
    search,
    workType,
    limit: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const columns: ColumnsType<ConsentFormSubmission> = useMemo(
    () => [
      {
        title: 'Submitted',
        dataIndex: 'submittedAt',
        key: 'submittedAt',
        width: 130,
        render: (val: string) => formatDate(val),
      },
      {
        title: 'Client',
        key: 'client',
        render: (_: unknown, record) => (
          <a onClick={(): void => setSelectedId(record._id)}>
            {record.firstName} {record.lastName}
          </a>
        ),
      },
      {
        title: 'Email',
        dataIndex: 'email',
        key: 'email',
        ellipsis: true,
      },
      {
        title: 'Phone',
        dataIndex: 'phone',
        key: 'phone',
        width: 130,
      },
      {
        title: 'Work Type',
        dataIndex: 'workType',
        key: 'workType',
        width: 110,
        render: (val: WorkType) => <Tag color="blue">{val}</Tag>,
      },
      {
        title: 'TFN/ABN/ACN',
        key: 'tfn',
        width: 140,
        render: (_: unknown, record) => (
          <Text code style={{ fontSize: 12 }}>
            •••• {record.tfnAbnAcnLast4}
          </Text>
        ),
      },
      {
        title: 'BSB',
        key: 'bsb',
        width: 120,
        render: (_: unknown, record) => (
          <Text code style={{ fontSize: 12 }}>
            •••• {record.bsbLast4}
          </Text>
        ),
      },
      {
        title: 'Account',
        key: 'account',
        width: 140,
        render: (_: unknown, record) => (
          <Text code style={{ fontSize: 12 }}>
            •••• {record.accountNumberLast4}
          </Text>
        ),
      },
      {
        title: 'DOB Year',
        dataIndex: 'dateOfBirthYear',
        key: 'dob',
        width: 100,
      },
      {
        title: 'State',
        dataIndex: 'state',
        key: 'state',
        width: 80,
      },
    ],
    [],
  );

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
        <Title level={3} style={{ margin: 0 }}>
          Consent Forms
        </Title>
        <Button icon={<EyeOutlined />} onClick={(): void => router.push('/consent-forms/preview')}>
          Preview Form
        </Button>
      </div>

      <Alert
        type="info"
        showIcon
        icon={<SafetyOutlined />}
        message="Sensitive fields are encrypted at rest"
        description="TFN/ABN/ACN, BSB, account number, and date of birth are encrypted on the API server using AES-256-GCM and are never decrypted into this UI. You will only ever see the last 4 digits and the year of birth."
        style={{ marginBottom: 16 }}
      />

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={14}>
            <Input
              placeholder="Search by name, email, phone, account name, or last-4..."
              prefix={<SearchOutlined />}
              allowClear
              value={searchInput}
              onChange={(e): void => setSearchInput(e.target.value)}
              onPressEnter={(): void => {
                setSearch(searchInput.trim() || undefined);
                setPage(1);
              }}
              onBlur={(): void => {
                setSearch(searchInput.trim() || undefined);
                setPage(1);
              }}
            />
          </Col>
          <Col xs={24} sm={10}>
            <Select<WorkType | undefined>
              placeholder="Work type"
              allowClear
              style={{ width: '100%' }}
              value={workType}
              onChange={(v): void => {
                setWorkType(v);
                setPage(1);
              }}
              options={WORK_TYPES.map((w) => ({ label: w, value: w }))}
            />
          </Col>
        </Row>
      </Card>

      <Table<ConsentFormSubmission>
        columns={columns}
        dataSource={rows}
        rowKey="_id"
        loading={isLoading || isFetching}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showTotal: (t) => `${t} submissions`,
          onChange: (p): void => setPage(p),
        }}
        locale={{
          emptyText: (
            <div style={{ padding: 24 }}>
              <LockOutlined style={{ fontSize: 28, color: '#bbb' }} />
              <div style={{ marginTop: 8, color: '#888' }}>No consent form submissions yet.</div>
            </div>
          ),
        }}
      />

      <ConsentFormDetailDrawer id={selectedId} onClose={(): void => setSelectedId(null)} />
    </div>
  );
}
