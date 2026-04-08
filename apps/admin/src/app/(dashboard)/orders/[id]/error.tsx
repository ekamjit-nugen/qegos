'use client';

import { useEffect } from 'react';
import { Result, Button, Space } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

/**
 * Order detail error boundary.
 */
export default function OrderDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactNode {
  const router = useRouter();

  useEffect(() => {
    console.error('[Order Detail Error]', error); // eslint-disable-line no-console
  }, [error]);

  const is404 = error.message?.toLowerCase().includes('not found');

  return (
    <div style={{ padding: '48px 24px' }}>
      <Result
        status={is404 ? '404' : 'error'}
        title={is404 ? 'Order Not Found' : 'Failed to Load Order'}
        subTitle={
          is404
            ? 'This order may have been deleted or the ID is invalid.'
            : 'An error occurred while loading the order details.'
        }
        extra={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/orders')}>
              Back to Orders
            </Button>
            {!is404 && (
              <Button type="primary" icon={<ReloadOutlined />} onClick={() => reset()}>
                Try Again
              </Button>
            )}
          </Space>
        }
      />
    </div>
  );
}
