'use client';

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
} from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { useMyOrders } from '@/hooks/usePortal';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/types/order';
import type { Order } from '@/types/order';
import { formatCurrency } from '@/lib/utils/format';

const { Title, Text } = Typography;

export function OrderListPage(): React.ReactNode {
  const router = useRouter();
  const { data: orders, isLoading } = useMyOrders();

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
        My Orders
      </Title>

      {(!orders || orders.length === 0) ? (
        <Empty description="No orders found" />
      ) : (
        <Row gutter={[16, 16]}>
          {orders.map((order: Order) => (
            <Col xs={24} sm={12} lg={8} key={order._id}>
              <Card
                hoverable
                onClick={() => { router.push(`/orders/${order._id}`); }}
                actions={[
                  <Button
                    key="view"
                    type="link"
                    icon={<EyeOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/orders/${order._id}`);
                    }}
                  >
                    View Details
                  </Button>,
                ]}
              >
                <div style={{ marginBottom: 12 }}>
                  <Text strong style={{ fontSize: 16 }}>
                    {order.orderNumber}
                  </Text>
                  <Tag
                    color={ORDER_STATUS_COLORS[order.status]}
                    style={{ marginLeft: 8 }}
                  >
                    {ORDER_STATUS_LABELS[order.status]}
                  </Tag>
                </div>

                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  Financial Year: {order.financialYear}
                </Text>

                <Progress
                  percent={order.completionPercent}
                  size="small"
                  style={{ marginBottom: 12 }}
                />

                <Text strong style={{ fontSize: 18 }}>
                  {formatCurrency(order.finalAmount)}
                </Text>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
