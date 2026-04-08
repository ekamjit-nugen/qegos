import { Skeleton, Card, Row, Col, Divider } from 'antd';

/**
 * Tax summary page loading skeleton.
 */
export default function TaxSummaryLoading(): React.ReactNode {
  return (
    <div>
      <Skeleton.Input active size="large" style={{ width: 200, marginBottom: 24 }} />

      {/* Year selector */}
      <Skeleton.Input active size="default" style={{ width: 160, marginBottom: 24 }} />

      <Row gutter={24}>
        <Col xs={24} md={16}>
          <Card style={{ marginBottom: 16 }}>
            <Skeleton.Input active size="default" style={{ width: 140, marginBottom: 16 }} />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <Skeleton.Input active size="small" style={{ width: '40%' }} />
                <Skeleton.Input active size="small" style={{ width: '20%' }} />
              </div>
            ))}
            <Divider />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Skeleton.Input active size="default" style={{ width: '30%' }} />
              <Skeleton.Input active size="default" style={{ width: '15%' }} />
            </div>
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card style={{ marginBottom: 16 }}>
            <Skeleton active paragraph={{ rows: 4 }} />
          </Card>
          <Card>
            <Skeleton active paragraph={{ rows: 3 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
