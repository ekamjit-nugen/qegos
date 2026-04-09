'use client';

import { type ReactNode } from 'react';
import {
  Row,
  Col,
  Card,
  Button,
  Space,
  Typography,
  Timeline,
  Progress,
  Tag,
  Spin,
  Empty,
} from 'antd';
import {
  TeamOutlined,
  FileTextOutlined,
  DollarOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  AuditOutlined,
  RiseOutlined,
  CheckCircleOutlined,
  EditOutlined,
  UserAddOutlined,
  SwapOutlined,
  BarChartOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { formatCurrency, formatRelative } from '@/lib/utils/format';
import { api } from '@/lib/api/client';
import type { AuditLog } from '@/types/auditLog';

const { Title, Text } = Typography;

// ─── Recent Activity Hook ─────────────────────────────────────────────────────

function useRecentActivity(): { data: AuditLog[] | undefined; isLoading: boolean } {
  const result = useQuery({
    queryKey: ['dashboard', 'recent-activity'],
    queryFn: async () => {
      try {
        const res = await api.post('/audit-logs/query', { limit: 8, page: 1 });
        return (res.data?.data ?? []) as AuditLog[];
      } catch {
        return [];
      }
    },
    refetchInterval: 60_000,
  });
  return { data: result.data, isLoading: result.isLoading };
}

// ─── Activity Icon ────────────────────────────────────────────────────────────

function getActivityIcon(action: string): ReactNode {
  if (action.includes('create')) return <UserAddOutlined style={{ color: '#52c41a' }} />;
  if (action.includes('update') || action.includes('change')) return <EditOutlined style={{ color: '#1677ff' }} />;
  if (action.includes('delete')) return <ClockCircleOutlined style={{ color: '#ff4d4f' }} />;
  if (action.includes('login')) return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
  if (action.includes('status')) return <SwapOutlined style={{ color: '#722ed1' }} />;
  return <AuditOutlined style={{ color: '#8c8c8c' }} />;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  iconColor: string;
  loading: boolean;
  valueStyle?: React.CSSProperties;
}

function StatCard({ title, value, icon, iconColor, loading, valueStyle }: StatCardProps): ReactNode {
  return (
    <Card
      loading={loading}
      style={{ borderRadius: 8, border: '1px solid #f0f0f0', height: '100%' }}
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
          <Text type="secondary" style={{ fontSize: 13 }}>{title}</Text>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, marginTop: 2, ...valueStyle }}>
            {value}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function DashboardPage(): ReactNode {
  const router = useRouter();
  const { stats, isLoading } = useDashboardStats();
  const { data: activities, isLoading: activitiesLoading } = useRecentActivity();

  const orderStatusBreakdown = [
    { label: 'Pending', percent: 20, color: '#faad14' },
    { label: 'In Progress', percent: 35, color: '#1677ff' },
    { label: 'Review', percent: 15, color: '#722ed1' },
    { label: 'Completed', percent: 30, color: '#52c41a' },
  ];

  const conversionRate = stats.activeLeads > 0
    ? Math.round((stats.ordersInProgress / (stats.activeLeads + stats.ordersInProgress)) * 100)
    : 0;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <BarChartOutlined style={{ marginRight: 8 }} />Dashboard
          </Title>
          <Text type="secondary">Overview of your business at a glance</Text>
        </div>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { router.push('/leads?action=create'); }}>
            New Lead
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => { router.push('/orders?action=create'); }}>
            New Order
          </Button>
        </Space>
      </div>

      {/* ─── Stat Cards ──────────────────────────────────────────────── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={4}>
          <StatCard title="Active Leads" value={stats.activeLeads} icon={<TeamOutlined />} iconColor="#1677ff" loading={isLoading} />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <StatCard title="New Today" value={stats.newLeadsToday} icon={<RiseOutlined />} iconColor="#52c41a" loading={isLoading} />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card
            loading={isLoading}
            style={{ borderRadius: 8, border: '1px solid #f0f0f0', height: '100%' }}
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
                  color: '#52c41a',
                  flexShrink: 0,
                }}
              >
                <DollarOutlined />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 13 }}>Revenue (This Month)</Text>
                <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2, marginTop: 2 }}>
                  {formatCurrency(stats.revenueThisMonth)}
                </div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <StatCard
            title="In Progress"
            value={stats.ordersInProgress}
            icon={<FileTextOutlined />}
            iconColor="#722ed1"
            loading={isLoading}
          />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <StatCard
            title="Overdue"
            value={stats.overdueReminders}
            icon={<ClockCircleOutlined />}
            iconColor={stats.overdueReminders > 0 ? '#ff4d4f' : '#8c8c8c'}
            loading={isLoading}
            valueStyle={stats.overdueReminders > 0 ? { color: '#ff4d4f' } : undefined}
          />
        </Col>
      </Row>

      {/* ─── Bottom Row ──────────────────────────────────────────────── */}
      <Row gutter={[16, 16]}>
        {/* Recent Activity */}
        <Col xs={24} lg={14}>
          <Card
            title={<><ThunderboltOutlined style={{ marginRight: 8 }} />Recent Activity</>}
            style={{ borderRadius: 8, border: '1px solid #f0f0f0', height: '100%' }}
            styles={{ body: { padding: '16px 24px', maxHeight: 420, overflow: 'auto' } }}
          >
            {activitiesLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            ) : !activities || activities.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No recent activity" />
            ) : (
              <Timeline
                items={activities.map((a) => ({
                  dot: getActivityIcon(a.action),
                  children: (
                    <div>
                      <Text style={{ fontSize: 13 }}>
                        {a.description || `${a.action} on ${a.resource}`}
                      </Text>
                      <br />
                      <Space size={4}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {formatRelative(a.timestamp)}
                        </Text>
                        {a.actorType && (
                          <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                            {a.actorType}
                          </Tag>
                        )}
                      </Space>
                    </div>
                  ),
                }))}
              />
            )}
          </Card>
        </Col>

        {/* Quick Stats */}
        <Col xs={24} lg={10}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* Pending Reviews */}
            <Card
              style={{ borderRadius: 8, border: '1px solid #f0f0f0' }}
              styles={{ body: { padding: '20px 20px' } }}
              loading={isLoading}
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
                    color: '#fa8c16',
                  }}
                >
                  <AuditOutlined />
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 13 }}>Pending Reviews</Text>
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, marginTop: 2 }}>
                    {stats.pendingReviews}
                  </div>
                </div>
              </div>
            </Card>

            {/* Lead Conversion */}
            <Card
              title={<><TeamOutlined style={{ marginRight: 8 }} />Lead Conversion</>}
              style={{ borderRadius: 8, border: '1px solid #f0f0f0' }}
              styles={{ body: { textAlign: 'center', padding: '20px' } }}
            >
              <Progress
                type="dashboard"
                percent={conversionRate}
                size={130}
                format={(pct) => (
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 700 }}>{pct}%</div>
                    <Text type="secondary" style={{ fontSize: 11 }}>Leads to Orders</Text>
                  </div>
                )}
              />
            </Card>

            {/* Orders by Status */}
            <Card
              title={<><FileTextOutlined style={{ marginRight: 8 }} />Orders by Status</>}
              style={{ borderRadius: 8, border: '1px solid #f0f0f0' }}
            >
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {orderStatusBreakdown.map((item) => (
                  <div key={item.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13 }}>{item.label}</Text>
                      <Text strong style={{ fontSize: 13 }}>{item.percent}%</Text>
                    </div>
                    <Progress percent={item.percent} showInfo={false} strokeColor={item.color} size="small" />
                  </div>
                ))}
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>
    </div>
  );
}
