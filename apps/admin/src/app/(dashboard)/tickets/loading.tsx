'use client';

import { Skeleton, Card, Space } from 'antd';

/**
 * Support tickets page loading skeleton.
 */
export default function TicketsLoading(): React.ReactNode {
  return (
    <div style={{ padding: 24 }}>
      <Space style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Skeleton.Input active size="large" style={{ width: 180 }} />
        <Skeleton.Button active size="default" style={{ width: 130 }} />
      </Space>

      {/* Priority tabs */}
      <Space style={{ marginBottom: 16 }}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton.Button key={i} active size="default" style={{ width: 90 }} />
        ))}
      </Space>

      <Card>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            style={{ display: 'flex', gap: 16, padding: '14px 0', borderBottom: '1px solid #f0f0f0' }}
          >
            <Skeleton.Input active size="small" style={{ width: '10%' }} />
            <Skeleton.Input active size="small" style={{ width: '30%' }} />
            <Skeleton.Input active size="small" style={{ width: '12%' }} />
            <Skeleton.Input active size="small" style={{ width: '12%' }} />
            <Skeleton.Input active size="small" style={{ width: '15%' }} />
            <Skeleton.Button active size="small" style={{ width: '8%' }} />
          </div>
        ))}
      </Card>
    </div>
  );
}
