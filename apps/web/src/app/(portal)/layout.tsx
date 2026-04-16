'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Layout, Menu, Typography, Button, Avatar, Badge, theme } from 'antd';
import {
  HomeOutlined,
  ShoppingCartOutlined,
  CalendarOutlined,
  MessageOutlined,
  FolderOpenOutlined,
  CalculatorOutlined,
  BellOutlined,
  FileTextOutlined,
  FormOutlined,
  WalletOutlined,
  LogoutOutlined,
  LockOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/lib/auth/useAuth';
import { ProtectedRoute } from '@/lib/auth/ProtectedRoute';
import { useUnreadNotificationCount } from '@/hooks/usePortal';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

interface NavItem {
  key: string;
  icon: ReactNode;
  label: ReactNode;
}

function buildNavItems(unreadCount: number): NavItem[] {
  return [
    { key: '/', icon: <HomeOutlined />, label: 'Dashboard' },
    { key: '/file-tax', icon: <FormOutlined />, label: 'File Tax' },
    { key: '/orders', icon: <ShoppingCartOutlined />, label: 'My Orders' },
    { key: '/appointments', icon: <CalendarOutlined />, label: 'Appointments' },
    { key: '/chat', icon: <MessageOutlined />, label: 'Chat' },
    { key: '/vault', icon: <FolderOpenOutlined />, label: 'Document Vault' },
    { key: '/tax-summary', icon: <CalculatorOutlined />, label: 'Tax Summary' },
    { key: '/consent-form', icon: <FileTextOutlined />, label: 'Consent Form' },
    { key: '/credits', icon: <WalletOutlined />, label: 'Credits' },
    {
      key: '/notifications',
      icon: <BellOutlined />,
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          Notifications
          {unreadCount > 0 && (
            <Badge count={unreadCount} size="small" style={{ backgroundColor: '#ff4d4f' }} />
          )}
        </span>
      ),
    },
  ];
}

function getInitials(firstName?: string, lastName?: string): string {
  const f = firstName?.charAt(0)?.toUpperCase() ?? '';
  const l = lastName?.charAt(0)?.toUpperCase() ?? '';
  return f + l || '?';
}

function PortalShell({ children }: { children: ReactNode }): ReactNode {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { token: t } = theme.useToken();
  const { data: unreadCount = 0 } = useUnreadNotificationCount();

  const navItems = buildNavItems(unreadCount);

  const handleLogout = useCallback(async (): Promise<void> => {
    await logout();
    router.replace('/login');
  }, [logout, router]);

  const selectedKey =
    navItems.find((item) => (item.key === '/' ? pathname === '/' : pathname.startsWith(item.key)))
      ?.key ?? '/';

  return (
    <Layout style={{ minHeight: '100vh', background: '#f7f8fa' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={240}
        style={{
          background: '#fff',
          borderRight: '1px solid #f0f0f0',
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '0' : '0 24px',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Text
            strong
            style={{
              color: t.colorPrimary,
              fontSize: collapsed ? 18 : 20,
              letterSpacing: 2,
              fontWeight: 800,
            }}
          >
            {collapsed ? 'Q' : 'QEGOS'}
          </Text>
        </div>

        {/* Navigation */}
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={({ key }) => {
            router.push(key);
          }}
          items={navItems}
          style={{
            border: 'none',
            marginTop: 8,
            fontSize: 14,
          }}
        />

        {/* User card at bottom */}
        {!collapsed && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: '16px 20px',
              borderTop: '1px solid #f0f0f0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar
                size={36}
                style={{
                  background: t.colorPrimary,
                  color: '#fff',
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {getInitials(user?.firstName, user?.lastName)}
              </Avatar>
              <div style={{ lineHeight: 1.3, flex: 1, minWidth: 0 }}>
                <Text strong style={{ fontSize: 13, display: 'block' }} ellipsis>
                  {user?.firstName ?? ''} {user?.lastName ?? ''}
                </Text>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Client Portal
                </Text>
              </div>
            </div>
          </div>
        )}
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 240, transition: 'margin-left 0.2s' }}>
        {/* Top header */}
        <Header
          style={{
            padding: '0 24px',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
            position: 'sticky',
            top: 0,
            zIndex: 9,
            height: 56,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => {
              setCollapsed(!collapsed);
            }}
            style={{ fontSize: 16 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Badge count={unreadCount} size="small" offset={[-4, 4]}>
              <Button
                type="text"
                icon={<BellOutlined style={{ fontSize: 18 }} />}
                onClick={() => {
                  router.push('/notifications');
                }}
                aria-label="Notifications"
              />
            </Badge>
            <Button
              type="text"
              icon={<LockOutlined />}
              onClick={() => {
                router.push('/change-password');
              }}
            >
              Change Password
            </Button>
            <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </Header>

        {/* Content */}
        <Content style={{ margin: 20, minHeight: 'calc(100vh - 96px)' }}>{children}</Content>
      </Layout>
    </Layout>
  );
}

export default function PortalLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <ProtectedRoute>
      <PortalShell>{children}</PortalShell>
    </ProtectedRoute>
  );
}
