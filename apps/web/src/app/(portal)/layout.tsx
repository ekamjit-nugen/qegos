'use client';

import { useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Layout, Typography, Button, Space } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { useAuth } from '@/lib/auth/useAuth';
import { ProtectedRoute } from '@/lib/auth/ProtectedRoute';
import { fullName } from '@/lib/utils/format';

const { Header, Content, Footer } = Layout;
const { Text } = Typography;

function PortalShell({ children }: { children: ReactNode }): ReactNode {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = useCallback(async (): Promise<void> => {
    await logout();
    router.replace('/login');
  }, [logout, router]);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          padding: '0 24px',
        }}
      >
        <Text strong style={{ fontSize: 18, color: '#1677ff' }}>
          QEGOS
        </Text>
        <Space>
          <Text>{fullName(user?.firstName, user?.lastName)}</Text>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={handleLogout}
          >
            Logout
          </Button>
        </Space>
      </Header>
      <Content style={{ padding: 24, background: '#f5f5f5' }}>
        {children}
      </Content>
      <Footer style={{ textAlign: 'center', color: '#999' }}>
        QEGOS Client Portal
      </Footer>
    </Layout>
  );
}

export default function PortalLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <ProtectedRoute>
      <PortalShell>{children}</PortalShell>
    </ProtectedRoute>
  );
}
