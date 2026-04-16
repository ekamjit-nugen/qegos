'use client';

import { Skeleton, Card, Row, Col, Divider } from 'antd';

/**
 * Order detail loading skeleton.
 */
export default function OrderDetailLoading(): React.ReactNode {
  return (
    <div>
      {/* Back button + title */}
      <Skeleton.Input active size="small" style={{ width: 100, marginBottom: 16 }} />
      <Skeleton.Input active size="large" style={{ width: 260, marginBottom: 24 }} />

      <Row gutter={24}>
        <Col xs={24} md={16}>
          <Card style={{ marginBottom: 16 }}>
            <Skeleton active paragraph={{ rows: 2 }} />
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
              <Skeleton.Input active size="default" style={{ width: 120 }} />
            </div>
          </Card>

          {/* Status timeline */}
          <Card>
            <Skeleton.Input active size="small" style={{ width: 100, marginBottom: 16 }} />
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <Skeleton.Avatar active size={20} shape="circle" />
                <Skeleton.Input active size="small" style={{ width: '60%' }} />
              </div>
            ))}
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card>
            <Skeleton active paragraph={{ rows: 5 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
