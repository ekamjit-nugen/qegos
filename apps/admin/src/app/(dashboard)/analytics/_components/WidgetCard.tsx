'use client';

import React from 'react';
import { Card, Spin, Empty, Alert, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

interface WidgetCardProps {
  title: React.ReactNode;
  /** Loading state */
  loading?: boolean;
  /** Error object (from React Query) */
  error?: Error | null;
  /** Retry callback */
  onRetry?: () => void;
  /** Whether data is empty after loading */
  empty?: boolean;
  /** Custom empty message */
  emptyText?: string;
  /** Minimum card height */
  minHeight?: number;
  /** Extra actions in card header */
  extra?: React.ReactNode;
  children: React.ReactNode;
}

export function WidgetCard({
  title,
  loading,
  error,
  onRetry,
  empty,
  emptyText = 'No data available',
  minHeight = 200,
  extra,
  children,
}: WidgetCardProps): React.ReactNode {
  const cardExtra = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {extra}
      {onRetry && (
        <Button
          type="text"
          size="small"
          icon={<ReloadOutlined />}
          onClick={onRetry}
          title="Refresh widget"
        />
      )}
    </div>
  );

  return (
    <Card
      title={title}
      extra={cardExtra}
      style={{ minHeight }}
      styles={{ body: { minHeight: minHeight - 58 } }}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: minHeight - 80 }}>
          <Spin />
        </div>
      ) : error ? (
        <Alert
          type="error"
          message="Failed to load"
          description={error.message || 'An unexpected error occurred.'}
          action={onRetry && (
            <Button size="small" onClick={onRetry}>Retry</Button>
          )}
          showIcon
        />
      ) : empty ? (
        <Empty description={emptyText} />
      ) : (
        children
      )}
    </Card>
  );
}
