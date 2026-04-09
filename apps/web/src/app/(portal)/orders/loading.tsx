'use client';

import { Skeleton, Card, Row, Col } from 'antd';

/**
 * Orders list loading skeleton — card-based layout matching the client portal style.
 */
export default function OrdersLoading(): React.ReactNode {
  return (
    <div>
      <Skeleton.Input active size="large" style={{ width: 150, marginBottom: 24 }} />

      <Row gutter={[16, 16]}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Col key={i} xs={24} sm={12} md={8}>
            <Card bodyStyle={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <Skeleton.Input active size="small" style={{ width: 100 }} />
                <Skeleton.Button active size="small" style={{ width: 80 }} />
              </div>
              <Skeleton.Input active size="small" style={{ width: '90%', marginBottom: 8 }} />
              <Skeleton.Input active size="small" style={{ width: '60%', marginBottom: 8 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                <Skeleton.Input active size="small" style={{ width: 80 }} />
                <Skeleton.Input active size="small" style={{ width: 60 }} />
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
