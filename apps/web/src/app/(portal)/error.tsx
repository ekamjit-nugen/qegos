'use client';

import { useEffect } from 'react';
import { Result, Button, Space } from 'antd';
import { ReloadOutlined, HomeOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

/**
 * Portal-level error boundary.
 * Shown inside the portal layout (header/footer preserved).
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactNode {
  const router = useRouter();

  useEffect(() => {
    console.error('[Portal Page Error]', error); // eslint-disable-line no-console
  }, [error]);

  return (
    <div style={{ padding: '48px 24px', maxWidth: 500, margin: '0 auto' }}>
      <Result
        status="error"
        title="Something went wrong"
        subTitle="We couldn't load this page. Please try again or go back to the dashboard."
        extra={
          <Space>
            <Button type="primary" icon={<ReloadOutlined />} onClick={() => reset()}>
              Try Again
            </Button>
            <Button icon={<HomeOutlined />} onClick={() => router.push('/')}>
              Dashboard
            </Button>
          </Space>
        }
      />
    </div>
  );
}
