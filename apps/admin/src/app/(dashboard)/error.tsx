'use client';

import { useEffect } from 'react';
import { Result, Button, Typography, Space } from 'antd';
import { ReloadOutlined, HomeOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

const { Paragraph, Text } = Typography;

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactNode {
  const router = useRouter();

  useEffect(() => {
    // Log to error reporting service in production
    console.error('[Dashboard Error]', error); // eslint-disable-line no-console
  }, [error]);

  return (
    <div style={{ padding: '48px 24px', maxWidth: 600, margin: '0 auto' }}>
      <Result
        status="error"
        title="Something went wrong"
        subTitle="An unexpected error occurred while loading this page."
        extra={
          <Space>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={() => reset()}
            >
              Try Again
            </Button>
            <Button
              icon={<HomeOutlined />}
              onClick={() => router.push('/')}
            >
              Back to Dashboard
            </Button>
          </Space>
        }
      >
        {process.env.NODE_ENV === 'development' && (
          <div style={{ textAlign: 'left' }}>
            <Paragraph>
              <Text strong style={{ fontSize: 14, color: '#cf1322' }}>
                {error.name}: {error.message}
              </Text>
            </Paragraph>
            {error.digest && (
              <Paragraph>
                <Text type="secondary">Digest: {error.digest}</Text>
              </Paragraph>
            )}
            {error.stack && (
              <pre
                style={{
                  background: '#f5f5f5',
                  padding: 12,
                  borderRadius: 6,
                  fontSize: 11,
                  overflow: 'auto',
                  maxHeight: 200,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {error.stack}
              </pre>
            )}
          </div>
        )}
      </Result>
    </div>
  );
}
