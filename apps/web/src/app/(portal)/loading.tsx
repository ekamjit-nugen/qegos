import { Skeleton, Card, Row, Col } from 'antd';

/**
 * Portal-level loading skeleton — dashboard-style stat cards + quick actions.
 */
export default function PortalLoading(): React.ReactNode {
  return (
    <div>
      {/* Welcome header */}
      <Skeleton.Input active size="large" style={{ width: 280, marginBottom: 8 }} />
      <Skeleton.Input active size="small" style={{ width: 180, marginBottom: 32 }} />

      {/* Stat cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
        {[1, 2, 3, 4].map((i) => (
          <Col key={i} xs={12} sm={6}>
            <Card bodyStyle={{ padding: 20 }}>
              <Skeleton.Input active size="small" style={{ width: '70%', marginBottom: 8 }} />
              <Skeleton.Input active size="large" style={{ width: '40%' }} />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Quick action cards */}
      <Skeleton.Input active size="default" style={{ width: 140, marginBottom: 16 }} />
      <Row gutter={[16, 16]}>
        {[1, 2, 3].map((i) => (
          <Col key={i} xs={24} sm={8}>
            <Card bodyStyle={{ padding: 20, textAlign: 'center' }}>
              <Skeleton.Avatar active size={48} shape="circle" style={{ marginBottom: 12 }} />
              <Skeleton.Input active size="small" style={{ width: '60%', marginBottom: 4 }} />
              <Skeleton.Input active size="small" style={{ width: '80%' }} />
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
