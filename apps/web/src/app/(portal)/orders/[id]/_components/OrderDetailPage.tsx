'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  List,
  Progress,
  Row,
  Space,
  Spin,
  Statistic,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  CheckCircleOutlined,
  DollarCircleOutlined,
  FileTextOutlined,
  CalendarOutlined,
  UserOutlined,
  BankOutlined,
  RightOutlined,
  CreditCardOutlined,
} from '@ant-design/icons';
import { useOrder, useGenerateClientSigningUri } from '@/hooks/usePortal';
import { PayNowModal } from './PayNowModal';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/types/order';
import type { OrderLineItem, OrderDocument, SigningStatus } from '@/types/order';
import { SIGNING_STATUS_LABELS, SIGNING_STATUS_COLORS } from '@/types/order';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';

const { Title, Text, Paragraph } = Typography;

const LINE_ITEM_STATUS_COLORS: Record<string, string> = {
  not_started: 'default',
  in_progress: 'processing',
  completed: 'success',
  cancelled: 'error',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Payment Pending',
  succeeded: 'Paid',
  failed: 'Payment Failed',
  refunded: 'Refunded',
  partially_refunded: 'Partially Refunded',
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  succeeded: 'green',
  failed: 'red',
  refunded: 'blue',
  partially_refunded: 'gold',
};

const EFILE_STATUS_LABELS: Record<string, string> = {
  not_filed: 'Not Filed',
  pending: 'Preparing Lodgement',
  submitted: 'Submitted to ATO',
  accepted: 'Accepted by ATO',
  rejected: 'Rejected by ATO',
  assessed: 'Notice of Assessment Received',
};

const EFILE_STATUS_COLORS: Record<string, string> = {
  not_filed: 'default',
  pending: 'orange',
  submitted: 'blue',
  accepted: 'green',
  rejected: 'red',
  assessed: 'green',
};

interface OrderDetailPageProps {
  id: string;
}

export function OrderDetailPage({ id }: OrderDetailPageProps): React.ReactNode {
  const router = useRouter();
  const { data: order, isLoading, refetch } = useOrder(id);
  const generateUriMutation = useGenerateClientSigningUri();
  const [payOpen, setPayOpen] = useState(false);

  const handleSign = useCallback(
    (doc: OrderDocument) => {
      if (!doc.zohoRequestId || !doc.clientActionId) {
        void message.error('Signing information not available');
        return;
      }
      generateUriMutation.mutate(
        {
          orderId: id,
          zohoRequestId: doc.zohoRequestId,
          actionId: doc.clientActionId,
        },
        {
          onSuccess: (result) => {
            if (result.signUrl) {
              window.open(result.signUrl, '_blank');
            } else {
              void message.error('Signing URL not available');
            }
          },
          onError: () => {
            void message.error('Failed to get signing URL');
          },
        },
      );
    },
    [id, generateUriMutation],
  );

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

  const refundAmount = order.refundOrOwing ?? 0;
  const isRefund = refundAmount > 0;
  const isOwing = refundAmount < 0;

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

      {/* Header */}
      <Card
        style={{
          marginBottom: 16,
          background: 'linear-gradient(135deg, #1677ff11 0%, #52c41a11 100%)',
          border: '1px solid #f0f0f0',
        }}
      >
        <Row align="middle" justify="space-between" gutter={[16, 16]}>
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              {order.orderNumber}
            </Title>
            <div style={{ marginTop: 8 }}>
              <Tag color={ORDER_STATUS_COLORS[order.status]} style={{ marginRight: 8 }}>
                {ORDER_STATUS_LABELS[order.status]}
              </Tag>
              <Tag color="blue">FY {order.financialYear}</Tag>
            </div>
          </Col>
          <Col>
            <Space>
              {order.paymentStatus !== 'succeeded' && order.finalAmount > 0 && (
                <Button
                  type="primary"
                  icon={<CreditCardOutlined />}
                  onClick={() => { setPayOpen(true); }}
                >
                  Pay Now
                </Button>
              )}
              <Button
                type="primary"
                ghost
                icon={<FileTextOutlined />}
                onClick={() => { router.push(`/tax-summary?fy=${order.financialYear}`); }}
              >
                View FY Tax Summary
              </Button>
            </Space>
          </Col>
        </Row>
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">Overall progress</Text>
          <Progress percent={order.completionPercent} strokeColor={{ from: '#1677ff', to: '#52c41a' }} />
        </div>
      </Card>

      {/* Key status tiles */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {order.paymentStatus && (
          <Col xs={24} sm={12} md={8}>
            <Card size="small">
              <Statistic
                title={<><DollarCircleOutlined /> Payment</>}
                value={PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}
                valueStyle={{
                  fontSize: 18,
                  color: order.paymentStatus === 'succeeded' ? '#52c41a' : '#faad14',
                }}
              />
              <Tag color={PAYMENT_STATUS_COLORS[order.paymentStatus] ?? 'default'} style={{ marginTop: 8 }}>
                {formatCurrency(order.finalAmount)}
              </Tag>
            </Card>
          </Col>
        )}

        {order.eFileStatus && (
          <Col xs={24} sm={12} md={8}>
            <Card size="small">
              <Statistic
                title={<><BankOutlined /> ATO Lodgement</>}
                value={EFILE_STATUS_LABELS[order.eFileStatus] ?? order.eFileStatus}
                valueStyle={{ fontSize: 18 }}
              />
              <Tag color={EFILE_STATUS_COLORS[order.eFileStatus] ?? 'default'} style={{ marginTop: 8 }}>
                {order.eFileReference ? `Ref: ${order.eFileReference}` : 'Not yet submitted'}
              </Tag>
            </Card>
          </Col>
        )}

        {(isRefund || isOwing || order.noaReceived) && (
          <Col xs={24} sm={12} md={8}>
            <Card size="small">
              <Statistic
                title={isRefund ? 'Your Refund' : isOwing ? 'Amount Owing' : 'Assessment'}
                value={Math.abs(refundAmount) / 100}
                prefix="$"
                precision={2}
                valueStyle={{
                  fontSize: 20,
                  color: isRefund ? '#52c41a' : isOwing ? '#ff4d4f' : undefined,
                }}
              />
              {order.noaReceived && order.noaDate && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  NOA on {formatDateTime(order.noaDate)}
                </Text>
              )}
            </Card>
          </Col>
        )}
      </Row>

      {/* Scheduled appointment banner */}
      {order.scheduledAppointment && (
        <Alert
          type="info"
          showIcon
          icon={<CalendarOutlined />}
          style={{ marginBottom: 16 }}
          message={
            <Text strong>
              Upcoming Appointment: {order.scheduledAppointment.date} · {order.scheduledAppointment.timeSlot}
            </Text>
          }
          description={
            <div>
              <Text type="secondary">
                Type: {order.scheduledAppointment.type} · Status: {order.scheduledAppointment.status}
              </Text>
              {order.scheduledAppointment.meetingLink && (
                <div style={{ marginTop: 8 }}>
                  <Button
                    size="small"
                    type="primary"
                    href={order.scheduledAppointment.meetingLink}
                    target="_blank"
                  >
                    Join Meeting
                  </Button>
                </div>
              )}
            </div>
          }
        />
      )}

      {/* Processing staff */}
      {order.processingByName && (
        <Alert
          type="success"
          showIcon
          icon={<UserOutlined />}
          style={{ marginBottom: 16 }}
          message={<Text>Your tax preparer: <Text strong>{order.processingByName}</Text></Text>}
        />
      )}

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
                      {item.completionStatus.replace('_', ' ')}
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
            {order.creditApplied !== undefined && order.creditApplied > 0 && (
              <Descriptions.Item label="Credits Applied">
                <Text type="success">-{formatCurrency(order.creditApplied)}</Text>
              </Descriptions.Item>
            )}
            {order.promoCode && (
              <Descriptions.Item label="Promo Code">
                <Tag color="purple">{order.promoCode}</Tag>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Total">
              <Text strong style={{ fontSize: 16 }}>
                {formatCurrency(order.finalAmount)}
              </Text>
            </Descriptions.Item>
            {order.paymentStatus && (
              <Descriptions.Item label="Payment Status">
                <Tag color={PAYMENT_STATUS_COLORS[order.paymentStatus] ?? 'default'}>
                  {PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}
                </Tag>
              </Descriptions.Item>
            )}
          </Descriptions>
        </Card>

        <Card title="Documents">
          {order.documents.length === 0 ? (
            <Empty description="No documents" />
          ) : (
            <List
              dataSource={order.documents}
              renderItem={(doc: OrderDocument) => {
                const ss = (doc.signingStatus ?? 'not_started') as SigningStatus;
                return (
                  <List.Item
                    actions={[
                      ss === 'awaiting_client' ? (
                        <Button
                          key="sign"
                          type="primary"
                          size="small"
                          icon={<EditOutlined />}
                          loading={generateUriMutation.isPending}
                          onClick={() => { handleSign(doc); }}
                        >
                          Sign Document
                        </Button>
                      ) : ss === 'client_signed' || ss === 'awaiting_admin' ? (
                        <Tag key="status" color="blue">
                          Awaiting counter-signature
                        </Tag>
                      ) : ss === 'completed' ? (
                        <Tag key="status" icon={<CheckCircleOutlined />} color="success">
                          Fully Signed
                        </Tag>
                      ) : ss === 'declined' ? (
                        <Tag key="status" color="red">Declined</Tag>
                      ) : null,
                    ].filter(Boolean)}
                  >
                    <List.Item.Meta
                      title={doc.fileName}
                      description={
                        <div>
                          <Text type="secondary">{doc.documentType ?? '-'}</Text>
                          {ss !== 'not_started' && (
                            <Tag
                              color={SIGNING_STATUS_COLORS[ss]}
                              style={{ marginLeft: 8 }}
                            >
                              {SIGNING_STATUS_LABELS[ss]}
                            </Tag>
                          )}
                        </div>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          )}
        </Card>

        <Card title="Progress Timeline">
          <Timeline
            items={[
              {
                color: 'green',
                children: (
                  <>
                    <Text strong>Order Created</Text>
                    <Paragraph type="secondary" style={{ margin: 0 }}>
                      {formatDateTime(order.createdAt)}
                    </Paragraph>
                  </>
                ),
              },
              ...(order.paymentStatus === 'succeeded'
                ? [{
                    color: 'green' as const,
                    children: (
                      <>
                        <Text strong>Payment Received</Text>
                        <Paragraph type="secondary" style={{ margin: 0 }}>
                          {formatCurrency(order.finalAmount)} paid
                        </Paragraph>
                      </>
                    ),
                  }]
                : []),
              ...(order.processingByName
                ? [{
                    color: 'blue' as const,
                    children: (
                      <>
                        <Text strong>Assigned to {order.processingByName}</Text>
                      </>
                    ),
                  }]
                : []),
              ...(order.eFileStatus && order.eFileStatus !== 'not_filed'
                ? [{
                    color: order.eFileStatus === 'rejected' ? 'red' as const : 'blue' as const,
                    children: (
                      <>
                        <Text strong>{EFILE_STATUS_LABELS[order.eFileStatus]}</Text>
                        {order.eFileReference && (
                          <Paragraph type="secondary" style={{ margin: 0 }}>
                            Reference: {order.eFileReference}
                          </Paragraph>
                        )}
                      </>
                    ),
                  }]
                : []),
              ...(order.noaReceived
                ? [{
                    color: 'green' as const,
                    children: (
                      <>
                        <Text strong>Notice of Assessment Received</Text>
                        {order.noaDate && (
                          <Paragraph type="secondary" style={{ margin: 0 }}>
                            {formatDateTime(order.noaDate)}
                          </Paragraph>
                        )}
                      </>
                    ),
                  }]
                : []),
              {
                color: 'gray',
                children: (
                  <>
                    <Text strong>Last Updated</Text>
                    <Paragraph type="secondary" style={{ margin: 0 }}>
                      {formatDateTime(order.updatedAt)}
                    </Paragraph>
                  </>
                ),
              },
            ]}
          />
        </Card>

        {order.formAnswers && Object.keys(order.formAnswers).length > 0 && (
          <Card
            title="Your Submitted Answers"
            extra={
              <Button type="link" icon={<RightOutlined />} size="small" disabled>
                Read-only
              </Button>
            }
          >
            <Descriptions column={1} size="small" bordered>
              {Object.entries(order.formAnswers).slice(0, 20).map(([key, value]) => (
                <Descriptions.Item key={key} label={key}>
                  <Text>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</Text>
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Card>
        )}
      </div>

      <PayNowModal
        open={payOpen}
        onClose={() => { setPayOpen(false); }}
        orderId={id}
        orderNumber={order.orderNumber}
        baseAmount={order.finalAmount}
        onSuccess={() => {
          setPayOpen(false);
          void refetch();
        }}
      />
    </div>
  );
}
