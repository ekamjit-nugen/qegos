'use client';

import type { ReactNode } from 'react';
import { ConfigProvider, App } from 'antd';
import { AntdRegistry as NextAntdRegistry } from '@ant-design/nextjs-registry';
import { theme } from './theme';

export function AntdRegistry({ children }: { children: ReactNode }): ReactNode {
  return (
    <NextAntdRegistry>
      <ConfigProvider theme={theme}>
        <App>{children}</App>
      </ConfigProvider>
    </NextAntdRegistry>
  );
}
