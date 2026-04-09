'use client';

import { Skeleton, Card, Row, Col } from 'antd';

/**
 * Appointments page loading skeleton.
 */
export default function AppointmentsLoading(): React.ReactNode {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Skeleton.Input active size="large" style={{ width: 180 }} />
        <Skeleton.Button active size="default" style={{ width: 150 }} />
      </div>

      <Row gutter={[16, 16]}>
        {[1, 2, 3, 4].map((i) => (
          <Col key={i} xs={24} sm={12}>
            <Card bodyStyle={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <Skeleton.Input active size="small" style={{ width: 120 }} />
                <Skeleton.Button active size="small" style={{ width: 80 }} />
              </div>
              <Skeleton.Input active size="small" style={{ width: '80%', marginBottom: 8 }} />
              <Skeleton.Input active size="small" style={{ width: '60%', marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <Skeleton.Avatar active size={24} shape="circle" />
                <Skeleton.Input active size="small" style={{ width: 160 }} />
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
