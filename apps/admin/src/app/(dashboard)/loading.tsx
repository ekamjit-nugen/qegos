'use client';

import { Skeleton, Card, Space } from 'antd';

/**
 * Dashboard-level loading skeleton.
 * Shown during route transitions within the dashboard layout.
 * Uses Ant Design Skeleton for consistent styling.
 */
export default function DashboardLoading(): React.ReactNode {
  return (
    <div style={{ padding: 24 }}>
      {/* Page title skeleton */}
      <Skeleton.Input active size="large" style={{ width: 250, marginBottom: 24 }} />

      {/* Stat cards row */}
      <Space size={16} style={{ display: 'flex', marginBottom: 24 }}>
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} style={{ width: 220 }} bodyStyle={{ padding: 16 }}>
            <Skeleton.Input active size="small" style={{ width: 100, marginBottom: 8 }} />
            <Skeleton.Input active size="large" style={{ width: 80 }} />
          </Card>
        ))}
      </Space>

      {/* Table skeleton */}
      <Card>
        {/* Table header */}
        <Space style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Skeleton.Input active size="default" style={{ width: 200 }} />
          <Skeleton.Button active size="default" style={{ width: 100 }} />
        </Space>

        {/* Table rows */}
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 16,
              padding: '12px 0',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <Skeleton.Input active size="small" style={{ width: '15%' }} />
            <Skeleton.Input active size="small" style={{ width: '25%' }} />
            <Skeleton.Input active size="small" style={{ width: '20%' }} />
            <Skeleton.Input active size="small" style={{ width: '15%' }} />
            <Skeleton.Input active size="small" style={{ width: '10%' }} />
            <Skeleton.Button active size="small" style={{ width: '10%' }} />
          </div>
        ))}

        {/* Pagination skeleton */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Skeleton.Input active size="small" style={{ width: 200 }} />
        </div>
      </Card>
    </div>
  );
}
