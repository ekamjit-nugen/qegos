'use client';

import { Skeleton, Card, Row, Col } from 'antd';

/**
 * Document vault loading skeleton.
 */
export default function VaultLoading(): React.ReactNode {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Skeleton.Input active size="large" style={{ width: 180 }} />
        <Skeleton.Button active size="default" style={{ width: 140 }} />
      </div>

      {/* Storage usage bar */}
      <Card style={{ marginBottom: 24 }} bodyStyle={{ padding: 16 }}>
        <Skeleton.Input active size="small" style={{ width: 200, marginBottom: 8 }} />
        <Skeleton.Input active style={{ width: '100%', height: 8 }} />
      </Card>

      {/* Document cards */}
      <Row gutter={[16, 16]}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Col key={i} xs={24} sm={12} md={8}>
            <Card bodyStyle={{ padding: 16 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <Skeleton.Avatar active size={40} shape="square" />
                <div style={{ flex: 1 }}>
                  <Skeleton.Input active size="small" style={{ width: '80%', marginBottom: 4 }} />
                  <Skeleton.Input active size="small" style={{ width: '50%' }} />
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
