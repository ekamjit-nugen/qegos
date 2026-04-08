'use client';

import { Row, Col, Card, Statistic, Button, Space } from 'antd';
import {
  TeamOutlined,
  FileTextOutlined,
  DollarOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  AuditOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { formatCurrency } from '@/lib/utils/format';

export function DashboardPage(): React.ReactNode {
  const router = useRouter();
  const { stats, isLoading } = useDashboardStats();

  const cards = [
    {
      title: 'Active Leads',
      value: stats.activeLeads,
      icon: <TeamOutlined style={{ color: '#1677ff' }} />,
      color: '#e6f4ff',
    },
    {
      title: 'New Today',
      value: stats.newLeadsToday,
      icon: <RiseOutlined style={{ color: '#52c41a' }} />,
      color: '#f6ffed',
    },
    {
      title: 'Orders In Progress',
      value: stats.ordersInProgress,
      icon: <FileTextOutlined style={{ color: '#722ed1' }} />,
      color: '#f9f0ff',
    },
    {
      title: 'Revenue (Month)',
      value: stats.revenueThisMonth,
      formatter: (val: number) => formatCurrency(val),
      icon: <DollarOutlined style={{ color: '#52c41a' }} />,
      color: '#f6ffed',
    },
    {
      title: 'Overdue Reminders',
      value: stats.overdueReminders,
      icon: <ClockCircleOutlined style={{ color: '#ff4d4f' }} />,
      color: '#fff2f0',
      valueStyle: stats.overdueReminders > 0 ? { color: '#ff4d4f' } : undefined,
    },
    {
      title: 'Pending Reviews',
      value: stats.pendingReviews,
      icon: <AuditOutlined style={{ color: '#fa8c16' }} />,
      color: '#fff7e6',
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Dashboard</h2>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push('/leads?action=create')}>
            New Lead
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => router.push('/orders?action=create')}>
            New Order
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        {cards.map((card) => (
          <Col xs={24} sm={12} lg={8} key={card.title}>
            <Card loading={isLoading} style={{ background: card.color }}>
              <Statistic
                title={card.title}
                value={card.formatter ? card.formatter(card.value) : card.value}
                prefix={card.icon}
                valueStyle={card.valueStyle}
              />
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
