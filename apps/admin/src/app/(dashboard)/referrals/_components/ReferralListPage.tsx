'use client';

import { useState } from 'react';
import { Table, Tag, Select, Card, Row, Col } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useReferralList } from '@/hooks/useReferrals';
import type { Referral, ReferralListQuery, ReferralStatus } from '@/types/referral';
import {
  REFERRAL_STATUSES,
  REFERRAL_STATUS_LABELS,
  REFERRAL_STATUS_COLORS,
} from '@/types/referral';
import { formatDate } from '@/lib/utils/format';

export function ReferralListPage(): React.ReactNode {
  const [filters, setFilters] = useState<ReferralListQuery>({ page: 1, limit: 20 });
  const { data, isLoading } = useReferralList(filters);

  const columns: ColumnsType<Referral> = [
    {
      title: 'Code',
      dataIndex: 'referralCode',
      width: 160,
    },
    {
      title: 'Referrer ID',
      dataIndex: 'referrerId',
      render: (val: string) => val ?? '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (val: ReferralStatus) => (
        <Tag color={REFERRAL_STATUS_COLORS[val]}>{REFERRAL_STATUS_LABELS[val]}</Tag>
      ),
    },
    {
      title: 'Reward Type',
      dataIndex: 'rewardType',
      render: (val: string) => val ?? '-',
    },
    {
      title: 'Expires',
      dataIndex: 'expiresAt',
      render: (val: string) => formatDate(val),
      sorter: true,
      width: 120,
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      render: (val: string) => formatDate(val),
      sorter: true,
      width: 120,
    },
  ];

  const statusOptions = REFERRAL_STATUSES.map((s) => ({
    value: s,
    label: REFERRAL_STATUS_LABELS[s],
  }));

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Referrals</h2>
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

      <Table<Referral>
        columns={columns}
        dataSource={data?.data ?? []}
        rowKey="_id"
        loading={isLoading}
        pagination={{
          current: filters.page,
          pageSize: filters.limit,
          total: data?.meta?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `${total} referrals`,
          onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, limit: pageSize })),
        }}
      />
    </div>
  );
}
