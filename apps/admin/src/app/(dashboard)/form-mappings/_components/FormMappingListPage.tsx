'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Col, Input, Row, Select, Table, Tag, Typography } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useFormMappingList } from '@/hooks/useFormMappings';
import { useSalesList } from '@/hooks/useSales';
import type { FormMappingListRow } from '@/types/formMapping';

const { Title } = Typography;

function formatDate(val: string | undefined): string {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleDateString();
  } catch {
    return '—';
  }
}

export function FormMappingListPage(): React.ReactNode {
  const router = useRouter();
  const [salesItemId, setSalesItemId] = useState<string | undefined>();
  const [financialYear, setFinancialYear] = useState<string | undefined>();
  const [search, setSearch] = useState('');

  const { data: mappings, isLoading } = useFormMappingList({ salesItemId, financialYear });
  const { data: salesItems } = useSalesList();

  const salesById = useMemo(() => {
    const m = new Map<string, string>();
    (salesItems ?? []).forEach((s) => m.set(s._id, s.title));
    return m;
  }, [salesItems]);

  const filtered = useMemo(() => {
    if (!mappings) return [];
    if (!search) return mappings;
    const needle = search.toLowerCase();
    return mappings.filter((m) => m.title.toLowerCase().includes(needle));
  }, [mappings, search]);

  const columns: ColumnsType<FormMappingListRow> = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (val: string, record) => (
        <a onClick={() => router.push(`/form-mappings/${record._id}`)}>{val}</a>
      ),
    },
    {
      title: 'Sales Item',
      dataIndex: 'salesItemId',
      key: 'salesItem',
      render: (id: string) => salesById.get(id) ?? <span style={{ color: '#999' }}>unknown</span>,
    },
    {
      title: 'Financial Year',
      dataIndex: 'financialYear',
      key: 'fy',
      width: 140,
    },
    {
      title: 'Default Version',
      key: 'default',
      width: 160,
      render: (_: unknown, record) =>
        record.defaultVersion ? (
          <Tag color="green">v{record.defaultVersion.version} · active</Tag>
        ) : (
          <Tag color="default">none</Tag>
        ),
    },
    {
      title: 'Latest Draft',
      key: 'draft',
      width: 140,
      render: (_: unknown, record) =>
        record.latestDraft ? (
          <Tag color="gold">v{record.latestDraft.version} draft</Tag>
        ) : (
          <span style={{ color: '#999' }}>—</span>
        ),
    },
    {
      title: 'Active',
      dataIndex: 'activeCount',
      key: 'active',
      width: 90,
    },
    {
      title: 'Last Edited',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 140,
      render: (val: string) => formatDate(val),
    },
  ];

  const salesOptions = (salesItems ?? [])
    .filter((s) => s.isActive)
    .map((s) => ({ value: s._id, label: s.title }));

  // Basic set of financial years to filter by — infer from data
  const fyOptions = useMemo(() => {
    const set = new Set<string>();
    (mappings ?? []).forEach((m) => set.add(m.financialYear));
    return [...set].sort().map((v) => ({ value: v, label: v }));
  }, [mappings]);

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
          Form Mappings
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => router.push('/form-mappings/new')}
        >
          New Mapping
        </Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={10}>
            <Input
              placeholder="Search title..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} sm={7}>
            <Select
              placeholder="Sales item"
              allowClear
              style={{ width: '100%' }}
              options={salesOptions}
              value={salesItemId}
              onChange={(v) => setSalesItemId(v)}
              showSearch
              optionFilterProp="label"
            />
          </Col>
          <Col xs={12} sm={7}>
            <Select
              placeholder="Financial year"
              allowClear
              style={{ width: '100%' }}
              options={fyOptions}
              value={financialYear}
              onChange={(v) => setFinancialYear(v)}
            />
          </Col>
        </Row>
      </Card>

      <Table<FormMappingListRow>
        columns={columns}
        dataSource={filtered}
        rowKey="_id"
        loading={isLoading}
        pagination={{ pageSize: 20, showTotal: (t) => `${t} mappings` }}
      />
    </div>
  );
}
