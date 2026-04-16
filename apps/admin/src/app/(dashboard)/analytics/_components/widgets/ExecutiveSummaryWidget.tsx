'use client';

import { Row, Col, Statistic, Tag } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  DashboardOutlined,
  DollarOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  TeamOutlined,
  SwapOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useExecutiveSummary } from '@/hooks/useAnalytics';
import { formatCurrency } from '@/lib/utils/format';
import { WidgetCard } from '../WidgetCard';
import { useAnalyticsContext } from '../AnalyticsContext';

export function ExecutiveSummaryWidget(): React.ReactNode {
  const { filters } = useAnalyticsContext();
  const { data, isLoading, error, refetch } = useExecutiveSummary(filters);

  const mom = data?.revenue.monthOverMonth ?? 0;

  return (
    <WidgetCard
      title={
        <span>
          <DashboardOutlined />
          <span style={{ marginLeft: 8 }}>Executive Summary</span>
          {data?.revenue.isEstimated && (
            <Tag color="orange" style={{ marginLeft: 8 }}>
              Estimated
            </Tag>
          )}
        </span>
      }
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => void refetch()}
      empty={!data}
      minHeight={140}
    >
      {data && (
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={8} lg={4}>
            <Statistic
              title="Revenue (30d)"
              value={formatCurrency(data.revenue.totalCents)}
              prefix={<DollarOutlined style={{ color: '#52c41a' }} />}
              suffix={
                mom !== 0 && (
                  <span style={{ fontSize: 13, color: mom > 0 ? '#52c41a' : '#ff4d4f' }}>
                    {mom > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                    {Math.abs(mom)}%
                  </span>
                )
              }
            />
          </Col>
          <Col xs={12} sm={8} lg={4}>
            <Statistic
              title="Active Orders"
              value={data.orders.totalActive}
              prefix={<FileTextOutlined style={{ color: '#722ed1' }} />}
            />
          </Col>
          <Col xs={12} sm={8} lg={4}>
            <Statistic
              title="Completed (30d)"
              value={data.orders.completedThisMonth}
              prefix={<CheckCircleOutlined style={{ color: '#1677ff' }} />}
            />
          </Col>
          <Col xs={12} sm={8} lg={4}>
            <Statistic
              title="Total Leads"
              value={data.pipeline.totalLeads}
              prefix={<TeamOutlined style={{ color: '#1677ff' }} />}
            />
          </Col>
          <Col xs={12} sm={8} lg={4}>
            <Statistic
              title="Conversion Rate"
              value={data.pipeline.conversionRate}
              suffix="%"
              prefix={<SwapOutlined style={{ color: '#52c41a' }} />}
            />
          </Col>
          <Col xs={12} sm={8} lg={4}>
            <Statistic
              title="Churn Risk"
              value={data.churn.atRiskCount}
              prefix={
                <WarningOutlined
                  style={{ color: data.churn.atRiskCount > 0 ? '#ff4d4f' : '#8c8c8c' }}
                />
              }
              valueStyle={data.churn.atRiskCount > 0 ? { color: '#ff4d4f' } : undefined}
            />
          </Col>
        </Row>
      )}
    </WidgetCard>
  );
}
