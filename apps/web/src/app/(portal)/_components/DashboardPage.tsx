'use client';

import { useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  Col,
  Row,
  Spin,
  Typography,
  Button,
  Space,
  Avatar,
  Tag,
  Progress,
  Steps,
  Empty,
} from 'antd';
import {
  FileTextOutlined,
  MessageOutlined,
  ShoppingCartOutlined,
  CalendarOutlined,
  BellOutlined,
  UploadOutlined,
  ArrowRightOutlined,
  SmileOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/lib/auth/useAuth';
import {
  useMyOrders,
  useUnreadNotificationCount,
  useUpcomingAppointments,
} from '@/hooks/usePortal';
import { OrderStatus, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, type Order } from '@/types/order';

const { Title, Text } = Typography;

const ACTIVE_STATUSES: number[] = [1, 2, 3, 4, 5];

function getInitials(firstName?: string, lastName?: string): string {
  const f = firstName?.charAt(0)?.toUpperCase() ?? '';
  const l = lastName?.charAt(0)?.toUpperCase() ?? '';
  return f + l || '?';
}

function getTaxSeasonStep(orders: Order[] | undefined): number {
  if (!orders || orders.length === 0) return 0;
  const latestOrder = orders.reduce((best, o) => (o.status > best.status ? o : best), orders[0]);
  if (latestOrder.status >= OrderStatus.Assessed) return 4;
  if (latestOrder.status >= OrderStatus.Lodged) return 3;
  if (latestOrder.status >= OrderStatus.Completed) return 2;
  if (latestOrder.status >= OrderStatus.InProgress) return 1;
  return 0;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: number;
  icon: ReactNode;
  iconColor: string;
}

function StatCard({ title, value, icon, iconColor }: StatCardProps): ReactNode {
  return (
    <Card
      style={{ borderRadius: 8, border: '1px solid #f0f0f0' }}
      styles={{ body: { padding: '20px 20px' } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            background: '#f5f5f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            color: iconColor,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {title}
          </Text>
          <Title level={4} style={{ margin: 0 }}>
            {value}
          </Title>
        </div>
      </div>
    </Card>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function DashboardPage(): ReactNode {
  const router = useRouter();
  const { user } = useAuth();
  const { data: orders, isLoading: ordersLoading } = useMyOrders();
  const { data: unreadCount, isLoading: unreadLoading } = useUnreadNotificationCount();
  const { data: appointments, isLoading: appointmentsLoading } = useUpcomingAppointments();

  const activeOrderCount = useMemo(() => {
    if (!orders) return 0;
    return orders.filter((o) => ACTIVE_STATUSES.includes(o.status as number)).length;
  }, [orders]);

  const documentCount = useMemo(() => {
    if (!orders) return 0;
    return orders.reduce((acc, o) => acc + (o.documents?.length ?? 0), 0);
  }, [orders]);

  const recentOrders = useMemo(() => {
    if (!orders) return [];
    return [...orders]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 3);
  }, [orders]);

  const taxSeasonStep = useMemo(() => getTaxSeasonStep(orders), [orders]);

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
      {/* ─── Welcome Section ───────────────────────────────────────────── */}
      <Card
        style={{ borderRadius: 8, border: '1px solid #f0f0f0', marginBottom: 20 }}
        styles={{ body: { padding: '24px 28px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Avatar
              size={52}
              style={{ background: '#1677ff', color: '#fff', fontWeight: 700, fontSize: 20 }}
            >
              {getInitials(user?.firstName, user?.lastName)}
            </Avatar>
            <div>
              <Title level={4} style={{ margin: 0 }}>
                Welcome back, {user?.firstName ?? 'there'}{' '}
                <SmileOutlined style={{ fontSize: 18 }} />
              </Title>
              <Text type="secondary">Here&apos;s your tax summary at a glance</Text>
            </div>
          </div>
          <Space>
            <Button
              icon={<UploadOutlined />}
              onClick={() => {
                router.push('/vault');
              }}
            >
              Upload Document
            </Button>
            <Button
              type="primary"
              icon={<MessageOutlined />}
              onClick={() => {
                router.push('/chat');
              }}
            >
              Start Chat
            </Button>
          </Space>
        </div>
      </Card>

      {/* ─── Stat Cards ────────────────────────────────────────────────── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <StatCard
            title="Active Orders"
            value={activeOrderCount}
            icon={<ShoppingCartOutlined />}
            iconColor="#1677ff"
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title="Documents"
            value={documentCount}
            icon={<FileTextOutlined />}
            iconColor="#52c41a"
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title="Appointments"
            value={appointments?.length ?? 0}
            icon={<CalendarOutlined />}
            iconColor="#722ed1"
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title="Notifications"
            value={unreadCount ?? 0}
            icon={<BellOutlined />}
            iconColor="#fa8c16"
          />
        </Col>
      </Row>

      {/* ─── Tax Season Progress ───────────────────────────────────────── */}
      <Card
        title={
          <>
            <CalendarOutlined style={{ marginRight: 8 }} />
            Tax Season Progress
          </>
        }
        style={{ borderRadius: 8, border: '1px solid #f0f0f0', marginBottom: 20 }}
      >
        <Steps
          current={taxSeasonStep}
          items={[
            { title: 'Documents', description: 'Upload & collect', icon: <FolderOpenOutlined /> },
            { title: 'Preparation', description: 'In progress', icon: <FileTextOutlined /> },
            { title: 'Review', description: 'Quality check', icon: <ShoppingCartOutlined /> },
            { title: 'Lodgement', description: 'Submitted to ATO', icon: <UploadOutlined /> },
            { title: 'Assessment', description: 'ATO processed', icon: <CalendarOutlined /> },
          ]}
        />
      </Card>

      {/* ─── Recent Orders ─────────────────────────────────────────────── */}
      <Card
        title={
          <>
            <ShoppingCartOutlined style={{ marginRight: 8 }} />
            Recent Orders
          </>
        }
        extra={
          <Button
            type="link"
            onClick={() => {
              router.push('/orders');
            }}
          >
            View all <ArrowRightOutlined />
          </Button>
        }
        style={{ borderRadius: 8, border: '1px solid #f0f0f0' }}
      >
        {recentOrders.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No orders yet" />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={10}>
            {recentOrders.map((order) => (
              <Card
                key={order._id}
                size="small"
                hoverable
                onClick={() => {
                  router.push(`/orders/${order._id}`);
                }}
                style={{ borderRadius: 8, cursor: 'pointer', border: '1px solid #f0f0f0' }}
                styles={{ body: { padding: '12px 16px' } }}
              >
                <Row align="middle" gutter={16}>
                  <Col flex="auto">
                    <Space size={8}>
                      <FileTextOutlined style={{ color: '#8c8c8c' }} />
                      <Text strong>{order.orderNumber}</Text>
                      <Tag color={ORDER_STATUS_COLORS[order.status as OrderStatus]}>
                        {ORDER_STATUS_LABELS[order.status as OrderStatus]}
                      </Tag>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        FY {order.financialYear}
                      </Text>
                    </Space>
                  </Col>
                  <Col flex="180px">
                    <Progress percent={order.completionPercent} size="small" />
                  </Col>
                </Row>
              </Card>
            ))}
          </Space>
        )}
      </Card>
    </div>
  );
}
