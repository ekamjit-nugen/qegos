import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AntdRegistry } from '@/lib/antd/AntdRegistry';
import { QueryProvider } from '@/lib/query/QueryProvider';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'QEGOS Admin',
  description: 'QEGOS Tax Preparation Admin Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <html lang="en-AU">
      <body>
        <AntdRegistry>
          <QueryProvider>
            <AuthProvider>{children}</AuthProvider>
          </QueryProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
