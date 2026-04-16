import type { ReactNode } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';

export default function DashboardLayout({ children }: { children: ReactNode }): ReactNode {
  return <AdminLayout>{children}</AdminLayout>;
}
