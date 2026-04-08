'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  Col,
  Row,
  Spin,
  Statistic,
  Typography,
  Button,
  Space,
} from 'antd';
import {
  FileTextOutlined,
  MessageOutlined,
  ShoppingCartOutlined,
  CalendarOutlined,
  BellOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/lib/auth/useAuth';
import {
  useMyOrders,
  useUnreadNotificationCount,
  useUpcomingAppointments,
} from '@/hooks/usePortal';
import type { OrderStatus } from '@/types/order';

const { Title } = Typography;

const ACTIVE_STATUSES: OrderStatus[] = [1, 2, 3, 4, 5] as unknown as OrderStatus[];

export function DashboardPage(): React.ReactNode {
  const router = useRouter();
  const { user } = useAuth();
  const { data: orders, isLoading: ordersLoading } = useMyOrders();
  const { data: unreadCount, isLoading: unreadLoading } = useUnreadNotificationCount();
  const { data: appointments, isLoading: appointmentsLoading } = useUpcomingAppointments();

  const activeOrderCount = useMemo(() => {
    if (!orders) { return 0; }
    return orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length;
  }, [orders]);

  const documentCount = useMemo(() => {
    if (!orders) { return 0; }
    return orders.reduce((acc, o) => acc + (o.documents?.length ?? 0), 0);
  }, [orders]);

  const isLoading = ordersLoading || unreadLoading || appointmentsLoading;

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        Welcome back, {user?.firstName ?? 'there'}
      </Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Active Orders"
              value={activeOrderCount}
              prefix={<ShoppingCartOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Documents"
              value={documentCount}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Upcoming Appointments"
              value={appointments?.length ?? 0}
              prefix={<CalendarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Unread Notifications"
              value={unreadCount ?? 0}
              prefix={<BellOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Quick Actions">
        <Space wrap>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={() => { router.push('/vault'); }}
          >
            Upload Document
          </Button>
          <Button
            icon={<MessageOutlined />}
            onClick={() => { router.push('/chat'); }}
          >
            Start Chat
          </Button>
          <Button
            icon={<ShoppingCartOutlined />}
            onClick={() => { router.push('/orders'); }}
          >
            View Orders
          </Button>
        </Space>
      </Card>
    </div>
  );
}
