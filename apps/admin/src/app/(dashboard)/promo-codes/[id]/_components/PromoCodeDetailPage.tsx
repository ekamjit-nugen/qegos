'use client';

import React from 'react';
import { Card, Descriptions, Tag, Table, Typography, Spin, Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { usePromoCode } from '@/hooks/usePromoCodes';
import type { PromoCodeUsage } from '@/types/promoCode';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import Link from 'next/link';

const { Title } = Typography;

export default function PromoCodeDetailPage({ id }: { id: string }): React.ReactNode {
  const { data, isLoading } = usePromoCode(id);

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!data) return <div style={{ padding: 24 }}>Promo code not found</div>;

  const { promoCode, usage } = data;

  const now = new Date();
  let statusTag: React.ReactNode;
  if (!promoCode.isActive) statusTag = <Tag color="red">Inactive</Tag>;
  else if (new Date(promoCode.validUntil) < now) statusTag = <Tag color="orange">Expired</Tag>;
  else if (new Date(promoCode.validFrom) > now) statusTag = <Tag color="blue">Scheduled</Tag>;
  else statusTag = <Tag color="green">Active</Tag>;

  const usageColumns: ColumnsType<PromoCodeUsage> = [
    { title: 'User ID', dataIndex: 'userId', key: 'userId', ellipsis: true },
    { title: 'Order ID', dataIndex: 'orderId', key: 'orderId', ellipsis: true },
    {
      title: 'Discount Applied',
      dataIndex: 'discountApplied',
      key: 'discountApplied',
      render: (v: number) => `$${(v / 100).toFixed(2)}`,
    },
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm'),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/promo-codes">
          <Button icon={<ArrowLeftOutlined />}>Back to Promo Codes</Button>
        </Link>
      </div>

      <Title level={3} style={{ marginBottom: 24 }}>
        Promo Code: {promoCode.code} {statusTag}
      </Title>

      <Card title="Details" style={{ marginBottom: 24 }}>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="Code">{promoCode.code}</Descriptions.Item>
          <Descriptions.Item label="Description">{promoCode.description}</Descriptions.Item>
          <Descriptions.Item label="Discount Type">
            {promoCode.discountType === 'percent' ? 'Percentage' : 'Flat Amount'}
          </Descriptions.Item>
          <Descriptions.Item label="Discount Value">
            {promoCode.discountType === 'percent'
              ? `${promoCode.discountValue}%`
              : `$${(promoCode.discountValue / 100).toFixed(2)}`}
          </Descriptions.Item>
          <Descriptions.Item label="Min Order Amount">
            ${(promoCode.minOrderAmount / 100).toFixed(2)}
          </Descriptions.Item>
          <Descriptions.Item label="Max Discount">
            {promoCode.maxDiscountAmount
              ? `$${(promoCode.maxDiscountAmount / 100).toFixed(2)}`
              : 'No cap'}
          </Descriptions.Item>
          <Descriptions.Item label="Usage">
            {promoCode.usageCount}{promoCode.maxUsageTotal ? ` / ${promoCode.maxUsageTotal}` : ' (unlimited)'}
          </Descriptions.Item>
          <Descriptions.Item label="Per User Limit">{promoCode.maxUsagePerUser}</Descriptions.Item>
          <Descriptions.Item label="Valid From">
            {dayjs(promoCode.validFrom).format('DD/MM/YYYY HH:mm')}
          </Descriptions.Item>
          <Descriptions.Item label="Valid Until">
            {dayjs(promoCode.validUntil).format('DD/MM/YYYY HH:mm')}
          </Descriptions.Item>
          <Descriptions.Item label="Created">
            {dayjs(promoCode.createdAt).format('DD/MM/YYYY HH:mm')}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title={`Usage History (${usage.length})`}>
        <Table
          columns={usageColumns}
          dataSource={usage}
          rowKey="_id"
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
}
