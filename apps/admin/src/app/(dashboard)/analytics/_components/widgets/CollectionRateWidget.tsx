'use client';

import { Card, Row, Col, Statistic, Progress, Spin, Empty } from 'antd';
import { BankOutlined } from '@ant-design/icons';
import { useCollectionRate } from '@/hooks/useAnalytics';
import { formatCurrency } from '@/lib/utils/format';

export function CollectionRateWidget(): React.ReactNode {
  const { data, isLoading } = useCollectionRate();

  if (isLoading) {
    return (
      <Card title={<span><BankOutlined /> Collection Rate</span>} style={{ minHeight: 200 }}>
        <Spin />
      </Card>
    );
  }

  if (!data) {
    return (
      <Card title={<span><BankOutlined /> Collection Rate</span>} style={{ minHeight: 200 }}>
        <Empty description="No collection data" />
      </Card>
    );
  }

  const ratePercent = Math.round(data.onTimeRate * 100);

  return (
    <Card
      title={<span><BankOutlined /><span style={{ marginLeft: 8 }}>Collection Rate</span></span>}
    >
      <Row gutter={[16, 16]} align="middle">
        <Col xs={24} sm={8} style={{ textAlign: 'center' }}>
          <Progress
            type="circle"
            percent={ratePercent}
            size={100}
            strokeColor={ratePercent >= 80 ? '#52c41a' : ratePercent >= 60 ? '#faad14' : '#ff4d4f'}
          />
          <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 12 }}>On-Time Rate</div>
        </Col>
        <Col xs={12} sm={8}>
          <Statistic
            title="Avg Days to Payment"
            value={data.avgDaysToPayment}
            suffix="days"
          />
        </Col>
        <Col xs={12} sm={8}>
          <Statistic
            title="Outstanding"
            value={formatCurrency(data.outstandingReceivablesCents)}
            valueStyle={data.outstandingReceivablesCents > 0 ? { color: '#ff4d4f' } : undefined}
          />
        </Col>
      </Row>
    </Card>
  );
}
