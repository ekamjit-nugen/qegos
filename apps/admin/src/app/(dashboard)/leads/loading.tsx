'use client';

import { Skeleton, Card, Space, Row, Col } from 'antd';

/**
 * Leads page loading skeleton — stats + filterable table.
 */
export default function LeadsLoading(): React.ReactNode {
  return (
    <div style={{ padding: 24 }}>
      <Space style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Skeleton.Input active size="large" style={{ width: 120 }} />
        <Skeleton.Button active size="default" style={{ width: 120 }} />
      </Space>

      {/* Stat cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Col key={i} xs={12} sm={8} md={4} lg={4}>
            <Card bodyStyle={{ padding: 12 }}>
              <Skeleton.Input active size="small" style={{ width: '80%', marginBottom: 4 }} />
              <Skeleton.Input active size="default" style={{ width: '50%' }} />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Filters row */}
      <Card bodyStyle={{ padding: 16 }} style={{ marginBottom: 16 }}>
        <Space size={12}>
          <Skeleton.Input active size="default" style={{ width: 180 }} />
          <Skeleton.Input active size="default" style={{ width: 140 }} />
          <Skeleton.Input active size="default" style={{ width: 140 }} />
          <Skeleton.Button active size="default" style={{ width: 80 }} />
        </Space>
      </Card>

      {/* Table */}
      <Card>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 16,
              padding: '12px 0',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <Skeleton.Input active size="small" style={{ width: '12%' }} />
            <Skeleton.Input active size="small" style={{ width: '20%' }} />
            <Skeleton.Input active size="small" style={{ width: '15%' }} />
            <Skeleton.Input active size="small" style={{ width: '10%' }} />
            <Skeleton.Input active size="small" style={{ width: '12%' }} />
            <Skeleton.Input active size="small" style={{ width: '8%' }} />
            <Skeleton.Button active size="small" style={{ width: '8%' }} />
          </div>
        ))}
      </Card>
    </div>
  );
}
