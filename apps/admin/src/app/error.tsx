'use client';

import { useEffect } from 'react';
import { Result, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

/**
 * Root-level error boundary.
 * Catches errors outside the dashboard layout (e.g., layout-level crashes).
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactNode {
  useEffect(() => {
    console.error('[Root Error]', error); // eslint-disable-line no-console
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
            background: '#f0f2f5',
            fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
          }}
        >
          <Result
            status="500"
            title="Application Error"
            subTitle="Something went wrong. Please try refreshing the page."
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
