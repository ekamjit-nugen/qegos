'use client';

import { useEffect } from 'react';
import { Result, Button, Space } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

/**
 * Lead detail error boundary — handles invalid IDs, API failures, etc.
 */
export default function LeadDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactNode {
  const router = useRouter();

  useEffect(() => {
    console.error('[Lead Detail Error]', error); // eslint-disable-line no-console
  }, [error]);

  const is404 = error.message?.toLowerCase().includes('not found');

  return (
    <div style={{ padding: '48px 24px' }}>
      <Result
        status={is404 ? '404' : 'error'}
        title={is404 ? 'Lead Not Found' : 'Failed to Load Lead'}
        subTitle={
          is404
            ? 'This lead may have been deleted or the ID is invalid.'
            : 'An error occurred while loading the lead details.'
        }
        extra={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/leads')}>
              Back to Leads
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
