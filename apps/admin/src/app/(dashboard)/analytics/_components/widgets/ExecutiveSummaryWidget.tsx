'use client';

import { Card, Row, Col, Statistic, Tag, Spin } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { useExecutiveSummary } from '@/hooks/useAnalytics';
import { formatCurrency } from '@/lib/utils/format';

export function ExecutiveSummaryWidget(): React.ReactNode {
  const { data, isLoading } = useExecutiveSummary();

  if (isLoading || !data) {
    return (
      <Card title={<span><DashboardOutlined /> Executive Summary</span>}>
        <Spin />
      </Card>
    );
  }

  const mom = data.revenue.monthOverMonth;

  return (
    <Card
      title={
        <span>
          <DashboardOutlined />
          <span style={{ marginLeft: 8 }}>Executive Summary</span>
          {data.revenue.isEstimated && (
            <Tag color="orange" style={{ marginLeft: 8 }}>Estimated</Tag>
          )}
        </span>
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8}>
          <Statistic
            title="Revenue (30d)"
            value={formatCurrency(data.revenue.totalCents)}
            suffix={
              mom !== 0 && (
                <span style={{ fontSize: 14, color: mom > 0 ? '#52c41a' : '#ff4d4f' }}>
                  {mom > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                  {Math.abs(mom)}%
                </span>
              )
            }
          />
        </Col>
        <Col xs={12} sm={8}>
          <Statistic title="Active Orders" value={data.orders.totalActive} />
        </Col>
        <Col xs={12} sm={8}>
          <Statistic title="Completed (30d)" value={data.orders.completedThisMonth} />
        </Col>
        <Col xs={12} sm={8}>
          <Statistic title="Total Leads" value={data.pipeline.totalLeads} />
        </Col>
        <Col xs={12} sm={8}>
          <Statistic
            title="Conversion Rate"
            value={data.pipeline.conversionRate}
            suffix="%"
          />
        </Col>
        <Col xs={12} sm={8}>
          <Statistic
            title="Churn Risk"
            value={data.churn.atRiskCount}
            valueStyle={data.churn.atRiskCount > 0 ? { color: '#ff4d4f' } : undefined}
          />
        </Col>
      </Row>
    </Card>
  );
}
