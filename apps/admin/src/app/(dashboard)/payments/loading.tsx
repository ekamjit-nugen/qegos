'use client';

import { Skeleton, Card, Space, Row, Col } from 'antd';

/**
 * Payments page loading skeleton.
 */
export default function PaymentsLoading(): React.ReactNode {
  return (
    <div style={{ padding: 24 }}>
      <Skeleton.Input active size="large" style={{ width: 160, marginBottom: 24 }} />

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {[1, 2, 3, 4].map((i) => (
          <Col key={i} xs={12} md={6}>
            <Card bodyStyle={{ padding: 16 }}>
              <Skeleton.Input active size="small" style={{ width: '70%', marginBottom: 8 }} />
              <Skeleton.Input active size="large" style={{ width: '50%' }} />
            </Card>
          </Col>
        ))}
      </Row>

      <Card>
        <Space style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Skeleton.Input active size="default" style={{ width: 220 }} />
          <Skeleton.Input active size="default" style={{ width: 120 }} />
        </Space>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 16,
              padding: '12px 0',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <Skeleton.Input active size="small" style={{ width: '15%' }} />
            <Skeleton.Input active size="small" style={{ width: '20%' }} />
            <Skeleton.Input active size="small" style={{ width: '12%' }} />
            <Skeleton.Input active size="small" style={{ width: '12%' }} />
            <Skeleton.Input active size="small" style={{ width: '10%' }} />
            <Skeleton.Button active size="small" style={{ width: '8%' }} />
          </div>
        ))}
      </Card>
    </div>
  );
}
