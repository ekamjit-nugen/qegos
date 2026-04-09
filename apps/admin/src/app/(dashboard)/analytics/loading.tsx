'use client';

import { Skeleton, Card, Row, Col } from 'antd';

/**
 * Analytics page loading skeleton — mirrors the widget grid layout.
 */
export default function AnalyticsLoading(): React.ReactNode {
  return (
    <div style={{ padding: 24 }}>
      <Skeleton.Input active size="large" style={{ width: 200, marginBottom: 24 }} />

      {/* Executive summary cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Col key={i} xs={12} sm={8} md={4}>
            <Card bodyStyle={{ padding: 16 }}>
              <Skeleton.Input active size="small" style={{ width: '80%', marginBottom: 8 }} />
              <Skeleton.Input active size="large" style={{ width: '60%' }} />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Chart rows */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={16}>
          <Card bodyStyle={{ padding: 16 }}>
            <Skeleton.Input active size="small" style={{ width: 180, marginBottom: 16 }} />
            <Skeleton active paragraph={false} style={{ height: 280 }} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card bodyStyle={{ padding: 16 }}>
            <Skeleton.Input active size="small" style={{ width: 140, marginBottom: 16 }} />
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Skeleton.Avatar active size={200} shape="circle" />
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card bodyStyle={{ padding: 16 }}>
            <Skeleton.Input active size="small" style={{ width: 160, marginBottom: 16 }} />
            <Skeleton active paragraph={{ rows: 6 }} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card bodyStyle={{ padding: 16 }}>
            <Skeleton.Input active size="small" style={{ width: 160, marginBottom: 16 }} />
            <Skeleton active paragraph={{ rows: 6 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
