'use client';

import { useEffect } from 'react';
import { Result, Button, Space } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

/**
 * Ticket detail error boundary.
 */
export default function TicketDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactNode {
  const router = useRouter();

  useEffect(() => {
    console.error('[Ticket Detail Error]', error); // eslint-disable-line no-console
  }, [error]);

  const is404 = error.message?.toLowerCase().includes('not found');

  return (
    <div style={{ padding: '48px 24px' }}>
      <Result
        status={is404 ? '404' : 'error'}
        title={is404 ? 'Ticket Not Found' : 'Failed to Load Ticket'}
        subTitle={
          is404
            ? 'This ticket may have been closed or the ID is invalid.'
            : 'An error occurred while loading the ticket details.'
        }
        extra={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/tickets')}>
              Back to Tickets
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
