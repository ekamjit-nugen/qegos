'use client';

import { Card, Spin, Empty } from 'antd';
import { FundOutlined } from '@ant-design/icons';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import { useChannelRoi } from '@/hooks/useAnalytics';
import { formatCurrency } from '@/lib/utils/format';

export function ChannelRoiWidget(): React.ReactNode {
  const { data, isLoading } = useChannelRoi();

  if (isLoading) {
    return (
      <Card title={<span><FundOutlined /> Channel ROI</span>} style={{ minHeight: 350 }}>
        <Spin />
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card title={<span><FundOutlined /> Channel ROI</span>} style={{ minHeight: 350 }}>
        <Empty description="No campaign data" />
      </Card>
    );
  }

  const chartData = data.map((c) => ({
    channel: c.channel.replace(/_/g, ' '),
    Revenue: c.revenueCents / 100,
    Cost: c.costCents / 100,
    roi: c.roi,
  }));

  return (
    <Card
      title={<span><FundOutlined /><span style={{ marginLeft: 8 }}>Channel ROI</span></span>}
      style={{ minHeight: 350 }}
    >
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            fontSize={11}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
          />
          <YAxis type="category" dataKey="channel" fontSize={11} width={100} />
          <Tooltip formatter={(v: number) => formatCurrency(v * 100)} />
          <Legend />
          <Bar dataKey="Revenue" fill="#52c41a" />
          <Bar dataKey="Cost" fill="#ff4d4f" />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
