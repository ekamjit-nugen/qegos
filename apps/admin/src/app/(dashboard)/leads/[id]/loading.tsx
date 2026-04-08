import { Skeleton, Card, Row, Col, Space, Divider } from 'antd';

/**
 * Lead detail page loading skeleton.
 */
export default function LeadDetailLoading(): React.ReactNode {
  return (
    <div style={{ padding: 24 }}>
      {/* Breadcrumb + title */}
      <Skeleton.Input active size="small" style={{ width: 200, marginBottom: 8 }} />
      <Space style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Skeleton.Input active size="large" style={{ width: 280 }} />
        <Space>
          <Skeleton.Button active size="default" style={{ width: 100 }} />
          <Skeleton.Button active size="default" style={{ width: 100 }} />
        </Space>
      </Space>

      <Row gutter={24}>
        {/* Left column — details */}
        <Col xs={24} md={16}>
          <Card style={{ marginBottom: 16 }}>
            <Skeleton active avatar paragraph={{ rows: 3 }} />
            <Divider />
            <Skeleton active paragraph={{ rows: 4 }} />
          </Card>
          <Card>
            <Skeleton.Input active size="small" style={{ width: 120, marginBottom: 16 }} />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <Skeleton.Avatar active size={32} />
                <div style={{ flex: 1 }}>
                  <Skeleton.Input active size="small" style={{ width: '60%', marginBottom: 4 }} />
                  <Skeleton.Input active size="small" style={{ width: '40%' }} />
                </div>
              </div>
            ))}
          </Card>
        </Col>

        {/* Right column — sidebar */}
        <Col xs={24} md={8}>
          <Card style={{ marginBottom: 16 }}>
            <Skeleton active paragraph={{ rows: 5 }} />
          </Card>
          <Card>
            <Skeleton active paragraph={{ rows: 3 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
