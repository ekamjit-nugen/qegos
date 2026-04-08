'use client';

import { Card, Spin, Empty } from 'antd';
import { BarChartOutlined } from '@ant-design/icons';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useStaffBenchmark } from '@/hooks/useAnalytics';

export function StaffBenchmarkWidget(): React.ReactNode {
  const { data, isLoading } = useStaffBenchmark();

  if (isLoading) {
    return (
      <Card title={<span><BarChartOutlined /> Staff Benchmark</span>} style={{ minHeight: 350 }}>
        <Spin />
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card title={<span><BarChartOutlined /> Staff Benchmark</span>} style={{ minHeight: 350 }}>
        <Empty description="No staff data" />
      </Card>
    );
  }

  const chartData = data.slice(0, 10).map((s) => ({
    name: s.displayName.split(' ')[0] || s.staffId.slice(-4),
    Orders: s.ordersCompleted,
    Leads: s.leadsContacted,
    Tickets: s.ticketsResolved,
  }));

  return (
    <Card
      title={<span><BarChartOutlined /><span style={{ marginLeft: 8 }}>Staff Benchmark</span></span>}
      style={{ minHeight: 350 }}
    >
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip />
          <Legend />
          <Bar dataKey="Orders" fill="#1677ff" />
          <Bar dataKey="Leads" fill="#52c41a" />
          <Bar dataKey="Tickets" fill="#faad14" />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
