import { Result, Button } from 'antd';
import Link from 'next/link';
import { HomeOutlined } from '@ant-design/icons';

/**
 * Global 404 page for the admin app.
 * Shown when navigating to an unknown route.
 */
export default function NotFound(): React.ReactNode {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#f0f2f5',
      }}
    >
      <Result
        status="404"
        title="Page Not Found"
        subTitle="The page you're looking for doesn't exist or has been moved."
        extra={
          <Link href="/">
            <Button type="primary" icon={<HomeOutlined />}>
              Back to Dashboard
            </Button>
          </Link>
        }
      />
    </div>
  );
}
