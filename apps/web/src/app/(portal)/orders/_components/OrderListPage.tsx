'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  Col,
  Empty,
  Progress,
  Row,
  Spin,
  Tag,
  Typography,
  Button,
  Segmented,
  Statistic,
  Divider,
  Alert,
} from 'antd';
import {
  EyeOutlined,
  PlusOutlined,
  FileTextOutlined,
  BankOutlined,
  DollarCircleOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import { useMyOrders, useTaxSummaries } from '@/hooks/usePortal';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/types/order';
import type { Order } from '@/types/order';
import type { TaxYearSummary } from '@/types/taxSummary';
import { formatCurrency } from '@/lib/utils/format';

const { Title, Text } = Typography;

interface FYGroup {
  financialYear: string;
  orders: Order[];
  summary?: TaxYearSummary;
}

function groupByFY(orders: Order[], summaries: TaxYearSummary[]): FYGroup[] {
  const map = new Map<string, FYGroup>();
  for (const o of orders) {
    const fy = o.financialYear ?? 'Unknown';
    if (!map.has(fy)) map.set(fy, { financialYear: fy, orders: [] });
    map.get(fy)!.orders.push(o);
  }
  for (const s of summaries) {
    if (!map.has(s.financialYear)) {
      map.set(s.financialYear, { financialYear: s.financialYear, orders: [] });
    }
    map.get(s.financialYear)!.summary = s;
  }
  return Array.from(map.values()).sort((a, b) => b.financialYear.localeCompare(a.financialYear));
}

export function OrderListPage(): React.ReactNode {
  const router = useRouter();
  const { data: orders, isLoading } = useMyOrders();
  const { data: summaries } = useTaxSummaries();
  const [view, setView] = useState<'grouped' | 'flat'>('grouped');

  const groups = useMemo(() => groupByFY(orders ?? [], summaries ?? []), [orders, summaries]);

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  const hasData = (orders && orders.length > 0) || (summaries && summaries.length > 0);

  return (
    <div>
      <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            My Tax Filings
          </Title>
          <Text type="secondary">
            Everything you&apos;ve filed with us — grouped by financial year
          </Text>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              router.push('/file-tax');
            }}
          >
            File New Return
          </Button>
        </Col>
      </Row>

      <Segmented
        value={view}
        onChange={(v) => {
          setView(v as 'grouped' | 'flat');
        }}
        options={[
          { label: 'By Year', value: 'grouped' },
          { label: 'All Orders', value: 'flat' },
        ]}
        style={{ marginBottom: 16 }}
      />

      {!hasData ? (
        <Empty description="No tax filings yet" style={{ padding: 60 }}>
          <Button
            type="primary"
            onClick={() => {
              router.push('/file-tax');
            }}
          >
            Start Your First Return
          </Button>
        </Empty>
      ) : view === 'grouped' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {groups.map((g) => (
            <Card
              key={g.financialYear}
              title={
                <span>
                  <CalendarOutlined /> FY {g.financialYear}
                </span>
              }
              extra={
                g.summary && (
                  <Button
                    type="link"
                    icon={<FileTextOutlined />}
                    onClick={() => {
                      router.push(`/tax-summary?fy=${g.financialYear}`);
                    }}
                  >
                    View Tax Summary
                  </Button>
                )
              }
            >
              {g.summary && (
                <>
                  <Row gutter={16} style={{ marginBottom: 16 }}>
                    <Col xs={12} sm={6}>
                      <Statistic
                        title="Total Income"
                        value={g.summary.totalIncome / 100}
                        prefix="$"
                        precision={2}
                      />
                    </Col>
                    <Col xs={12} sm={6}>
                      <Statistic
                        title="Tax Withheld"
                        value={g.summary.taxWithheld / 100}
                        prefix="$"
                        precision={2}
                      />
                    </Col>
                    <Col xs={12} sm={6}>
                      <Statistic
                        title={g.summary.refundOrOwing >= 0 ? 'Refund' : 'Owing'}
                        value={Math.abs(g.summary.refundOrOwing) / 100}
                        prefix="$"
                        precision={2}
                        valueStyle={{
                          color: g.summary.refundOrOwing >= 0 ? '#52c41a' : '#ff4d4f',
                        }}
                      />
                    </Col>
                    <Col xs={12} sm={6}>
                      <Statistic
                        title="ATO Status"
                        value={g.summary.atoRefundStatus.toUpperCase()}
                        prefix={<BankOutlined />}
                      />
                    </Col>
                  </Row>
                  {g.summary.noaReceived && (
                    <Alert
                      type="success"
                      message="Notice of Assessment received"
                      showIcon
                      style={{ marginBottom: 12 }}
                    />
                  )}
                  <Divider style={{ margin: '12px 0' }}>Orders</Divider>
                </>
              )}

              {g.orders.length === 0 ? (
                <Empty description="No orders for this year" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <Row gutter={[16, 16]}>
                  {g.orders.map((order) => (
                    <Col xs={24} sm={12} lg={8} key={order._id}>
                      <OrderCard
                        order={order}
                        onView={() => {
                          router.push(`/orders/${order._id}`);
                        }}
                      />
                    </Col>
                  ))}
                </Row>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Row gutter={[16, 16]}>
          {(orders ?? []).map((order) => (
            <Col xs={24} sm={12} lg={8} key={order._id}>
              <OrderCard
                order={order}
                onView={() => {
                  router.push(`/orders/${order._id}`);
                }}
              />
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}

function OrderCard({ order, onView }: { order: Order; onView: () => void }): React.ReactNode {
  return (
    <Card
      hoverable
      onClick={onView}
      size="small"
      actions={[
        <Button
          key="view"
          type="link"
          icon={<EyeOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
        >
          View
        </Button>,
      ]}
    >
      <div style={{ marginBottom: 8 }}>
        <Text strong>{order.orderNumber}</Text>
        <Tag color={ORDER_STATUS_COLORS[order.status]} style={{ marginLeft: 8 }}>
          {ORDER_STATUS_LABELS[order.status]}
        </Tag>
      </div>
      <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
        FY {order.financialYear}
      </Text>
      <Progress percent={order.completionPercent} size="small" style={{ marginTop: 8 }} />
      <div
        style={{
          marginTop: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text strong>
          <DollarCircleOutlined /> {formatCurrency(order.finalAmount)}
        </Text>
        {order.eFileStatus && order.eFileStatus !== 'not_filed' && (
          <Tag color="blue">{order.eFileStatus}</Tag>
        )}
      </div>
    </Card>
  );
}
