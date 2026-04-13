'use client';

import React, { useState } from 'react';
import { Card, Table, Tag, Typography, Spin, Statistic, Empty } from 'antd';
import { WalletOutlined } from '@ant-design/icons';
import { useCreditBalance, useCreditTransactions } from '@/hooks/useCredits';
import type { CreditTransaction, CreditType } from '@/types/credit';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

const { Title } = Typography;

const TYPE_LABELS: Record<CreditType, string> = {
  referral_reward: 'Referral Reward',
  promo_credit: 'Promo Credit',
  refund_credit: 'Refund Credit',
  usage: 'Used',
  expiry: 'Expired',
};

const TYPE_COLORS: Record<CreditType, string> = {
  referral_reward: 'green',
  promo_credit: 'blue',
  refund_credit: 'cyan',
  usage: 'orange',
  expiry: 'red',
};

export function CreditsPage(): React.ReactNode {
  const [page, setPage] = useState(1);
  const { data: balanceData, isLoading: balanceLoading } = useCreditBalance();
  const { data: txData, isLoading: txLoading } = useCreditTransactions(page, 20);

  const columns: ColumnsType<CreditTransaction> = [
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (t: CreditType) => <Tag color={TYPE_COLORS[t]}>{TYPE_LABELS[t]}</Tag>,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (v: number) => (
        <span style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>
          {v >= 0 ? '+' : ''}{`$${(v / 100).toFixed(2)}`}
        </span>
      ),
    },
    {
      title: 'Balance',
      dataIndex: 'balance',
      key: 'balance',
      align: 'right',
      render: (v: number) => `$${(v / 100).toFixed(2)}`,
    },
    {
      title: 'Expires',
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (v: string | undefined) => v ? dayjs(v).format('DD/MM/YYYY') : '-',
    },
  ];

  if (balanceLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Title level={3}>My Credits</Title>

      <Card style={{ marginBottom: 24, textAlign: 'center' }}>
        <Statistic
          title="Credit Balance"
          value={(balanceData?.balance ?? 0) / 100}
          precision={2}
          prefix={<WalletOutlined />}
          suffix="AUD"
          valueStyle={{ color: '#1677ff', fontSize: 32 }}
        />
      </Card>

      <Card title="Transaction History">
        <Table
          columns={columns}
          dataSource={txData?.data ?? []}
          rowKey="_id"
          loading={txLoading}
          pagination={{
            current: page,
            pageSize: 20,
            total: txData?.pagination?.total ?? 0,
            onChange: (p) => setPage(p),
            showTotal: (t) => `Total ${t} transactions`,
          }}
          locale={{ emptyText: <Empty description="No credit transactions yet" /> }}
        />
      </Card>
    </div>
  );
}
