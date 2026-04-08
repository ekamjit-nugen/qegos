'use client';

import { Card, Row, Col, Empty } from 'antd';
import {
  BarChartOutlined,
  DollarOutlined,
  TeamOutlined,
  RiseOutlined,
  FundOutlined,
  CalendarOutlined,
  WarningOutlined,
  PieChartOutlined,
  BankOutlined,
  DashboardOutlined,
} from '@ant-design/icons';

const WIDGETS = [
  { title: 'Executive Summary', icon: <DashboardOutlined /> },
  { title: 'Revenue Forecast', icon: <DollarOutlined /> },
  { title: 'Customer Lifetime Value', icon: <TeamOutlined /> },
  { title: 'Staff Benchmark', icon: <BarChartOutlined /> },
  { title: 'Channel ROI', icon: <FundOutlined /> },
  { title: 'Seasonal Trends', icon: <CalendarOutlined /> },
  { title: 'Churn Risk', icon: <WarningOutlined /> },
  { title: 'Service Mix', icon: <PieChartOutlined /> },
  { title: 'Collection Rate', icon: <BankOutlined /> },
  { title: 'Pipeline Health', icon: <RiseOutlined /> },
];

export function AnalyticsPage(): React.ReactNode {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Analytics Dashboard</h2>
      </div>

      <Row gutter={[16, 16]}>
        {WIDGETS.map((widget) => (
          <Col xs={24} sm={12} lg={8} key={widget.title}>
            <Card
              title={
                <span>
                  {widget.icon}
                  <span style={{ marginLeft: 8 }}>{widget.title}</span>
                </span>
              }
              style={{ minHeight: 200 }}
            >
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Coming Soon"
              />
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
