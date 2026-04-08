'use client';

import React from 'react';
import { Row, Col, Card, Descriptions, Tag, Spin, Empty } from 'antd';
import { usePayment } from '@/hooks/usePayments';
import type { Payment } from '@/types/payment';
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from '@/types/payment';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';

export function PaymentDetailPage({ id }: { id: string }): React.ReactNode {
  const { data: payment, isLoading } = usePayment(id);

  if (isLoading) { return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />; }
  if (!payment) { return <Empty description="Payment not found" />; }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>
          {payment.paymentNumber}{' '}
          <Tag color={PAYMENT_STATUS_COLORS[payment.status]}>
            {PAYMENT_STATUS_LABELS[payment.status]}
          </Tag>
        </h2>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Payment Details">
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="Payment Number">{payment.paymentNumber}</Descriptions.Item>
              <Descriptions.Item label="Gateway">{payment.gateway}</Descriptions.Item>
              <Descriptions.Item label="Gateway Txn ID">{payment.gatewayTxnId ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Amount">{formatCurrency(payment.amount)}</Descriptions.Item>
              <Descriptions.Item label="Currency">{payment.currency}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={PAYMENT_STATUS_COLORS[payment.status]}>
                  {PAYMENT_STATUS_LABELS[payment.status]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Captured Amount">{formatCurrency(payment.capturedAmount)}</Descriptions.Item>
              <Descriptions.Item label="Refunded Amount">{formatCurrency(payment.refundedAmount)}</Descriptions.Item>
              <Descriptions.Item label="Failure Code">{payment.failureCode ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Failure Message">{payment.failureMessage ?? '-'}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Xero Integration" style={{ marginTop: 16 }}>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="Xero Synced">
                <Tag color={payment.xeroSynced ? 'green' : 'red'}>
                  {payment.xeroSynced ? 'Yes' : 'No'}
                </Tag>
              </Descriptions.Item>
              {(payment as Payment & { xeroPaymentId?: string }).xeroPaymentId && (
                <Descriptions.Item label="Xero Payment ID">
                  {(payment as Payment & { xeroPaymentId?: string }).xeroPaymentId}
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Status" style={{ marginBottom: 16 }}>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <Tag
                color={PAYMENT_STATUS_COLORS[payment.status]}
                style={{ fontSize: 16, padding: '4px 16px' }}
              >
                {PAYMENT_STATUS_LABELS[payment.status]}
              </Tag>
            </div>
          </Card>

          <Card title="Timeline" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Created">{formatDateTime(payment.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Updated">{formatDateTime(payment.updatedAt)}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Related">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Order ID">
                <a href={`/orders/${payment.orderId}`}>{payment.orderId}</a>
              </Descriptions.Item>
              <Descriptions.Item label="User ID">
                <a href={`/users/${payment.userId}`}>{payment.userId}</a>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
