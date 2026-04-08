'use client';

import { useEffect } from 'react';
import { Result, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

/**
 * Root-level error boundary for the client portal.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactNode {
  useEffect(() => {
    console.error('[Portal Error]', error); // eslint-disable-line no-console
  }, [error]);

  return (
    <html lang="en-AU">
      <body>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            background: '#f5f5f5',
            fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
          }}
        >
          <Result
            status="500"
            title="Something Went Wrong"
            subTitle="We're having trouble loading this page. Please try again."
            extra={
              <Button type="primary" icon={<ReloadOutlined />} onClick={() => reset()}>
                Reload Page
              </Button>
            }
          />
        </div>
      </body>
    </html>
  );
}
