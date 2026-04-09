'use client';

import { useState, useCallback, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Layout, Menu, Typography, Button, Avatar, Dropdown, theme } from 'antd';
import {
  LogoutOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { menuItems } from './menuConfig';
import { useAuth } from '@/lib/auth/useAuth';
import { ProtectedRoute } from '@/lib/auth/ProtectedRoute';
import { fullName } from '@/lib/utils/format';
import type { MenuProps } from 'antd';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

function getInitials(firstName?: string, lastName?: string): string {
  const f = firstName?.charAt(0)?.toUpperCase() ?? '';
  const l = lastName?.charAt(0)?.toUpperCase() ?? '';
  return f + l || '?';
}

// Convert menuConfig format to Ant Design Menu items
function buildMenuItems(
  items: typeof menuItems,
  onNavigate: (path: string) => void,
): MenuProps['items'] {
  return items.map((item, idx) => {
    if (item.children && item.children.length > 0) {
      return {
        key: `group-${idx}`,
        icon: item.icon,
        label: item.name,
        children: item.children.map((child) => ({
          key: child.path ?? child.name,
          icon: child.icon,
          label: child.name,
          onClick: () => { if (child.path) onNavigate(child.path); },
        })),
      };
    }
    return {
      key: item.path ?? item.name,
      icon: item.icon,
      label: item.name,
      onClick: () => { if (item.path) onNavigate(item.path); },
    };
  });
}

function getSelectedKey(pathname: string): string[] {
  // Find matching path from flat list of all menu items
  const allPaths: string[] = [];
  for (const item of menuItems) {
    if (item.path) allPaths.push(item.path);
    if (item.children) {
      for (const child of item.children) {
        if (child.path) allPaths.push(child.path);
      }
    }
  }
  // Find best match (longest prefix)
  const match = allPaths
    .filter((p) => p === '/' ? pathname === '/' : pathname.startsWith(p))
    .sort((a, b) => b.length - a.length)[0];
  return match ? [match] : ['/'];
}

function getOpenKeys(): string[] {
  // Open all sub-menus by default
  return menuItems
    .filter((item) => item.children && item.children.length > 0)
    .map((_, idx) => `group-${idx}`);
}

function AdminShell({ children }: { children: ReactNode }): ReactNode {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const { token: t } = theme.useToken();

  const handleLogout = useCallback(async (): Promise<void> => {
    await logout();
    router.replace('/login');
  }, [logout, router]);

  const handleNavigate = useCallback((path: string): void => {
    router.push(path);
  }, [router]);

  const antMenuItems = buildMenuItems(menuItems, handleNavigate);
  const selectedKeys = getSelectedKey(pathname);
  const [openKeys, setOpenKeys] = useState<string[]>(getOpenKeys());

  const userDropdownItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      danger: true,
      onClick: () => { void handleLogout(); },
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: '#f7f8fa' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={250}
        collapsedWidth={68}
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
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '0' : '0 20px',
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
          {!collapsed && (
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>Admin</Text>
          )}
        </div>

        {/* Navigation */}
        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          openKeys={collapsed ? [] : openKeys}
          onOpenChange={(keys) => { setOpenKeys(keys); }}
          items={antMenuItems}
          style={{
            border: 'none',
            marginTop: 4,
            fontSize: 13,
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
              padding: '14px 16px',
              borderTop: '1px solid #f0f0f0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar
                size={34}
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
                  {fullName(user?.firstName, user?.lastName)}
                </Text>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {user?.email ?? ''}
                </Text>
              </div>
            </div>
          </div>
        )}
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 68 : 250, transition: 'margin-left 0.2s' }}>
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
            onClick={() => { setCollapsed(!collapsed); }}
            style={{ fontSize: 16 }}
          />
          <Dropdown menu={{ items: userDropdownItems }} placement="bottomRight">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <Avatar
                size={32}
                style={{ background: t.colorPrimary, color: '#fff', fontWeight: 600 }}
              >
                {getInitials(user?.firstName, user?.lastName)}
              </Avatar>
              <Text style={{ fontSize: 13 }}>
                {fullName(user?.firstName, user?.lastName)}
              </Text>
            </div>
          </Dropdown>
        </Header>

        {/* Content */}
        <Content style={{ margin: 20, minHeight: 'calc(100vh - 96px)' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}

export function AdminLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <ProtectedRoute>
      <AdminShell>{children}</AdminShell>
    </ProtectedRoute>
  );
}
