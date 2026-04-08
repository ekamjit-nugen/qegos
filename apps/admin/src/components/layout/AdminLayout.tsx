'use client';

import { type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ProLayout } from '@ant-design/pro-components';
import { Dropdown, Space } from 'antd';
import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { menuItems } from './menuConfig';
import { useAuth } from '@/lib/auth/useAuth';
import { ProtectedRoute } from '@/lib/auth/ProtectedRoute';
import { fullName } from '@/lib/utils/format';

export function AdminLayout({ children }: { children: ReactNode }): ReactNode {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <ProtectedRoute>
      <ProLayout
        title="QEGOS"
        logo={null}
        layout="mix"
        fixSiderbar
        route={{ routes: menuItems }}
        location={{ pathname }}
        token={{
          sider: { colorMenuBackground: '#001529', colorTextMenu: '#ffffffa6', colorTextMenuSelected: '#fff' },
        }}
        menuItemRender={(item, dom) => (
          <a onClick={() => item.path && router.push(item.path)}>{dom}</a>
        )}
        avatarProps={{
          icon: <UserOutlined />,
          title: user ? fullName(user.firstName, user.lastName) : '',
          render: (_props, dom) => (
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: 'Logout',
                    onClick: () => void logout().then(() => router.push('/login')),
                  },
                ],
              }}
            >
              <Space>{dom}</Space>
            </Dropdown>
          ),
        }}
      >
        <div style={{ padding: 0 }}>{children}</div>
      </ProLayout>
    </ProtectedRoute>
  );
}
