'use client';

import { Skeleton, Card, Row, Col, Space, Divider } from 'antd';

/**
 * Order detail page loading skeleton.
 */
export default function OrderDetailLoading(): React.ReactNode {
  return (
    <div style={{ padding: 24 }}>
      <Skeleton.Input active size="small" style={{ width: 180, marginBottom: 8 }} />
      <Space style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Skeleton.Input active size="large" style={{ width: 300 }} />
        <Space>
          <Skeleton.Button active size="default" style={{ width: 120 }} />
          <Skeleton.Button active size="default" style={{ width: 100 }} />
        </Space>
      </Space>

      <Row gutter={24}>
        <Col xs={24} md={16}>
          {/* Order info */}
          <Card style={{ marginBottom: 16 }}>
            <Skeleton active paragraph={{ rows: 3 }} />
            <Divider />
            {/* Line items */}
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}
              >
                <Skeleton.Input active size="small" style={{ width: '50%' }} />
                <Skeleton.Input active size="small" style={{ width: '15%' }} />
              </div>
            ))}
            <Divider />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Skeleton.Input active size="default" style={{ width: 150 }} />
            </div>
          </Card>

          {/* Timeline */}
          <Card>
            <Skeleton.Input active size="small" style={{ width: 100, marginBottom: 16 }} />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <Skeleton.Avatar active size={24} shape="circle" />
                <div style={{ flex: 1 }}>
                  <Skeleton.Input active size="small" style={{ width: '70%', marginBottom: 4 }} />
                  <Skeleton.Input active size="small" style={{ width: '30%' }} />
                </div>
              </div>
            ))}
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card style={{ marginBottom: 16 }}>
            <Skeleton active paragraph={{ rows: 6 }} />
          </Card>
          <Card>
            <Skeleton active paragraph={{ rows: 4 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
