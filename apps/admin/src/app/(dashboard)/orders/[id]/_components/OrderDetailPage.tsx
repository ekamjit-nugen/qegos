'use client';

import { Row, Col, Card, Descriptions, Tabs, Table, Tag, Progress, Spin, Empty, Badge } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useOrder } from '@/hooks/useOrders';
import { OrderStatusTransition } from '../../_components/OrderStatusTransition';
import type { OrderLineItem, OrderDocument } from '@/types/order';
import { formatCurrency, formatDate, fullName } from '@/lib/utils/format';

export function OrderDetailPage({ id }: { id: string }): React.ReactNode {
  const { data: order, isLoading } = useOrder(id);

  if (isLoading) { return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />; }
  if (!order) { return <Empty description="Order not found" />; }

  const lineItemColumns: ColumnsType<OrderLineItem> = [
    { title: 'Service', dataIndex: 'title' },
    { title: 'Price', dataIndex: 'price', render: (v: number) => formatCurrency(v), width: 120 },
    { title: 'Qty', dataIndex: 'quantity', width: 60 },
    { title: 'Subtotal', dataIndex: 'subtotal', render: (v: number) => formatCurrency(v), width: 120 },
    {
      title: 'Status',
      dataIndex: 'completionStatus',
      render: (v: string) => <Tag>{v ?? 'pending'}</Tag>,
      width: 100,
    },
  ];

  const documentColumns: ColumnsType<OrderDocument> = [
    { title: 'File', dataIndex: 'fileName' },
    { title: 'Type', dataIndex: 'documentType', render: (v: string) => v ?? '-' },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (v: string) => (
        <Badge status={v === 'signed' ? 'success' : v === 'verified' ? 'processing' : 'default'} text={v} />
      ),
    },
  ];

  const tabItems = [
    {
      key: 'overview',
      label: 'Overview',
      children: (
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="Client">
            {fullName(order.personalDetails?.firstName, order.personalDetails?.lastName)}
          </Descriptions.Item>
          <Descriptions.Item label="Email">{order.personalDetails?.email ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Mobile">{order.personalDetails?.mobile ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Financial Year">{order.financialYear}</Descriptions.Item>
          <Descriptions.Item label="Order Type">{order.orderType ?? 'standard'}</Descriptions.Item>
          <Descriptions.Item label="E-File Status">{order.eFileStatus ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="E-File Reference">{order.eFileReference ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="NOA Received">{order.noaReceived ? 'Yes' : 'No'}</Descriptions.Item>
          <Descriptions.Item label="Created">{formatDate(order.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="Updated">{formatDate(order.updatedAt)}</Descriptions.Item>
        </Descriptions>
      ),
    },
    {
      key: 'lineItems',
      label: `Line Items (${order.lineItems.length})`,
      children: (
        <div>
          <Table<OrderLineItem>
            columns={lineItemColumns}
            dataSource={order.lineItems}
            rowKey={(r) => r._id ?? r.salesItemId}
            pagination={false}
            size="small"
          />
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Descriptions column={1} size="small" style={{ maxWidth: 300, marginLeft: 'auto' }}>
              <Descriptions.Item label="Subtotal">{formatCurrency(order.totalAmount)}</Descriptions.Item>
              {order.discountPercent > 0 && (
                <Descriptions.Item label={`Discount (${order.discountPercent}%)`}>
                  -{formatCurrency(order.discountAmount)}
                </Descriptions.Item>
              )}
              <Descriptions.Item label={<strong>Total</strong>}>
                <strong>{formatCurrency(order.finalAmount)}</strong>
              </Descriptions.Item>
            </Descriptions>
          </div>
        </div>
      ),
    },
    {
      key: 'documents',
      label: `Documents (${order.documents.length})`,
      children: (
        <Table<OrderDocument>
          columns={documentColumns}
          dataSource={order.documents}
          rowKey={(r) => r.documentId ?? r.fileName}
          pagination={false}
          size="small"
        />
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>
          {order.orderNumber} - {fullName(order.personalDetails?.firstName, order.personalDetails?.lastName)}
        </h2>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card>
            <Tabs items={tabItems} />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Status" style={{ marginBottom: 16 }}>
            <OrderStatusTransition orderId={id} currentStatus={order.status} />
          </Card>

          <Card title="Progress" style={{ marginBottom: 16 }}>
            <Progress
              type="circle"
              percent={order.completionPercent}
              size={120}
              style={{ display: 'block', margin: '0 auto' }}
            />
          </Card>

          <Card title="Financial Summary" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Subtotal">{formatCurrency(order.totalAmount)}</Descriptions.Item>
              <Descriptions.Item label="Discount">{order.discountPercent}%</Descriptions.Item>
              <Descriptions.Item label="Final">{formatCurrency(order.finalAmount)}</Descriptions.Item>
            </Descriptions>
          </Card>

          {order.processingByName && (
            <Card title="Processing By">
              <strong>{order.processingByName}</strong>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}
