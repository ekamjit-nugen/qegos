'use client';

import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  Descriptions,
  Empty,
  List,
  Progress,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useOrder } from '@/hooks/usePortal';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/types/order';
import type { OrderLineItem, OrderDocument } from '@/types/order';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';

const { Title, Text } = Typography;

const LINE_ITEM_STATUS_COLORS: Record<string, string> = {
  not_started: 'default',
  in_progress: 'processing',
  completed: 'success',
  cancelled: 'error',
};

const DOC_STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  signed: 'blue',
  verified: 'green',
};

interface OrderDetailPageProps {
  id: string;
}

export function OrderDetailPage({ id }: OrderDetailPageProps): React.ReactNode {
  const router = useRouter();
  const { data: order, isLoading } = useOrder(id);

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!order) {
    return <Empty description="Order not found" />;
  }

  return (
    <div>
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        onClick={() => { router.push('/orders'); }}
        style={{ padding: 0, marginBottom: 16 }}
      >
        Back to Orders
      </Button>

      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ display: 'inline', marginRight: 12 }}>
          {order.orderNumber}
        </Title>
        <Tag color={ORDER_STATUS_COLORS[order.status]} style={{ verticalAlign: 'middle' }}>
          {ORDER_STATUS_LABELS[order.status]}
        </Tag>
        <Progress
          percent={order.completionPercent}
          style={{ maxWidth: 400, marginTop: 12 }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card title="Services">
          {order.lineItems.length === 0 ? (
            <Empty description="No services" />
          ) : (
            <List
              dataSource={order.lineItems}
              renderItem={(item: OrderLineItem) => (
                <List.Item
                  extra={
                    <Tag color={LINE_ITEM_STATUS_COLORS[item.completionStatus] ?? 'default'}>
                      {item.completionStatus}
                    </Tag>
                  }
                >
                  <List.Item.Meta
                    title={item.title}
                    description={
                      <Text type="secondary">
                        {formatCurrency(item.price)} x {item.quantity} ={' '}
                        {formatCurrency(item.subtotal)}
                      </Text>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Card>

        <Card title="Financial Summary">
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Subtotal">
              {formatCurrency(order.totalAmount)}
            </Descriptions.Item>
            {order.discountAmount > 0 && (
              <Descriptions.Item label={`Discount (${order.discountPercent}%)`}>
                <Text type="success">-{formatCurrency(order.discountAmount)}</Text>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Total">
              <Text strong style={{ fontSize: 16 }}>
                {formatCurrency(order.finalAmount)}
              </Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="Documents">
          {order.documents.length === 0 ? (
            <Empty description="No documents" />
          ) : (
            <List
              dataSource={order.documents}
              renderItem={(doc: OrderDocument) => (
                <List.Item>
                  <List.Item.Meta title={doc.fileName} description={doc.documentType ?? '-'} />
                  <Tag color={DOC_STATUS_COLORS[doc.status] ?? 'default'}>{doc.status}</Tag>
                </List.Item>
              )}
            />
          )}
        </Card>

        <Card title="Timeline">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Created">
              {formatDateTime(order.createdAt)}
            </Descriptions.Item>
            <Descriptions.Item label="Last Updated">
              {formatDateTime(order.updatedAt)}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </div>
    </div>
  );
}
