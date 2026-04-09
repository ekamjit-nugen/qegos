'use client';

import { Row, Col, Statistic, Progress } from 'antd';
import { BankOutlined, ClockCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useCollectionRate } from '@/hooks/useAnalytics';
import { formatCurrency } from '@/lib/utils/format';
import { WidgetCard } from '../WidgetCard';
import { useAnalyticsContext } from '../AnalyticsContext';

export function CollectionRateWidget(): React.ReactNode {
  const { filters } = useAnalyticsContext();
  const { data, isLoading, error, refetch } = useCollectionRate(filters);

  const ratePercent = data ? Math.round(data.onTimeRate * 100) : 0;

  return (
    <WidgetCard
      title={<span><BankOutlined /><span style={{ marginLeft: 8 }}>Collection Rate</span></span>}
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => void refetch()}
      empty={!data}
      emptyText="No collection data"
      minHeight={370}
    >
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, padding: '8px 0' }}>
          <Progress
            type="dashboard"
            percent={ratePercent}
            size={140}
            strokeColor={ratePercent >= 80 ? '#52c41a' : ratePercent >= 60 ? '#faad14' : '#ff4d4f'}
            format={(pct) => (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 600 }}>{pct}%</div>
                <div style={{ fontSize: 11, color: '#8c8c8c' }}>On-Time</div>
              </div>
            )}
          />
          <Row gutter={[24, 16]} style={{ width: '100%' }}>
            <Col xs={12}>
              <Statistic
                title="Avg Days to Pay"
                value={data.avgDaysToPayment}
                suffix="days"
                prefix={<ClockCircleOutlined style={{ color: '#1677ff' }} />}
                valueStyle={{ fontSize: 20 }}
              />
            </Col>
            <Col xs={12}>
              <Statistic
                title="Outstanding"
                value={formatCurrency(data.outstandingReceivablesCents)}
                prefix={<ExclamationCircleOutlined style={{ color: data.outstandingReceivablesCents > 0 ? '#ff4d4f' : '#8c8c8c' }} />}
                valueStyle={{
                  fontSize: 20,
                  color: data.outstandingReceivablesCents > 0 ? '#ff4d4f' : undefined,
                }}
              />
            </Col>
          </Row>
        </div>
      )}
    </WidgetCard>
  );
}
