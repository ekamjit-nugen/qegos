'use client';

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
} from 'recharts';
import { useChannelRoi } from '@/hooks/useAnalytics';
import { formatCurrency } from '@/lib/utils/format';
import { WidgetCard } from '../WidgetCard';
import { useAnalyticsContext } from '../AnalyticsContext';

export function ChannelRoiWidget(): React.ReactNode {
  const { filters } = useAnalyticsContext();
  const { data, isLoading, error, refetch } = useChannelRoi(filters);

  const chartData = (data ?? []).map((c) => ({
    channel: c.channel.replace(/_/g, ' '),
    Revenue: c.revenueCents / 100,
    Cost: c.costCents / 100,
    roi: c.roi,
    leads: c.leadsGenerated,
    conversions: c.conversions,
  }));

  return (
    <WidgetCard
      title={<span><FundOutlined /><span style={{ marginLeft: 8 }}>Channel ROI</span></span>}
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => void refetch()}
      empty={!data || data.length === 0}
      emptyText="No campaign data"
      minHeight={370}
    >
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            type="number"
            fontSize={11}
            tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
          />
          <YAxis type="category" dataKey="channel" fontSize={11} width={100} />
          <Tooltip
            formatter={(v: number, name: string) => [formatCurrency(v * 100), name]}
            labelFormatter={(label: string) => {
              const ch = chartData.find((d) => d.channel === label);
              if (!ch) return label;
              return `${label} | ROI: ${(ch.roi * 100).toFixed(0)}% | ${ch.leads} leads, ${ch.conversions} conv`;
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Revenue" fill="#52c41a" radius={[0, 4, 4, 0]} />
          <Bar dataKey="Cost" fill="#ff4d4f" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </WidgetCard>
  );
}
