'use client';

import React from 'react';
import { Row, Col, Card, Descriptions, Tag, Spin, Empty, Button, Form, Input, Select, InputNumber, App } from 'antd';
import { useBillingDispute, useUpdateBillingDispute } from '@/hooks/useBillingDisputes';
import type { DisputeStatus } from '@/types/billingDispute';
import { DISPUTE_STATUS_LABELS, DISPUTE_STATUS_COLORS, DISPUTE_TYPE_LABELS } from '@/types/billingDispute';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';

const RESOLUTION_OPTIONS = [
  { value: 'full_refund', label: 'Full Refund' },
  { value: 'partial_refund', label: 'Partial Refund' },
  { value: 'credit_issued', label: 'Credit Issued' },
  { value: 'no_action', label: 'No Action' },
  { value: 'service_redo', label: 'Service Redo' },
  { value: 'discount_applied', label: 'Discount Applied' },
];

const RESOLUTION_LABELS: Record<string, string> = Object.fromEntries(
  RESOLUTION_OPTIONS.map((o) => [o.value, o.label]),
);

const STATUS_TRANSITIONS: Partial<Record<DisputeStatus, DisputeStatus>> = {
  raised: 'investigating',
  investigating: 'pending_approval',
  pending_approval: 'approved',
  approved: 'completed',
};

export function BillingDisputeDetailPage({ id }: { id: string }): React.ReactNode {
  const { data: dispute, isLoading } = useBillingDispute(id);
  const updateDispute = useUpdateBillingDispute();
  const { message } = App.useApp();
  const [form] = Form.useForm();

  if (isLoading) { return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />; }
  if (!dispute) { return <Empty description="Billing dispute not found" />; }

  const canEdit = dispute.status === 'investigating' || dispute.status === 'pending_approval';
  const nextStatus = STATUS_TRANSITIONS[dispute.status];
  const canReject = dispute.status === 'pending_approval';

  const handleStatusTransition = async (newStatus: DisputeStatus): Promise<void> => {
    try {
      await updateDispute.mutateAsync({ id: dispute._id, data: { status: newStatus } });
      message.success(`Status updated to ${DISPUTE_STATUS_LABELS[newStatus]}`);
    } catch {
      message.error('Failed to update status');
    }
  };

  const handleAssessmentSubmit = async (values: {
    staffAssessment?: string;
    resolution?: string;
    resolvedAmount?: number;
  }): Promise<void> => {
    try {
      await updateDispute.mutateAsync({ id: dispute._id, data: values });
      message.success('Assessment updated');
    } catch {
      message.error('Failed to update assessment');
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>
          Billing Dispute{' '}
          <Tag color="blue">
            {DISPUTE_TYPE_LABELS[dispute.disputeType]}
          </Tag>
        </h2>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Dispute Details">
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="Dispute Type">
                {DISPUTE_TYPE_LABELS[dispute.disputeType]}
              </Descriptions.Item>
              <Descriptions.Item label="Disputed Amount">
                {formatCurrency(dispute.disputedAmount)}
              </Descriptions.Item>
              <Descriptions.Item label="Client Statement" span={2}>
                {dispute.clientStatement}
              </Descriptions.Item>
              <Descriptions.Item label="Staff Assessment" span={2}>
                {dispute.staffAssessment ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Resolution">
                {dispute.resolution ? (RESOLUTION_LABELS[dispute.resolution] ?? dispute.resolution) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Resolved Amount">
                {dispute.resolvedAmount !== undefined ? formatCurrency(dispute.resolvedAmount) : '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {canEdit && (
            <Card title="Staff Assessment" style={{ marginTop: 16 }}>
              <Form
                form={form}
                layout="vertical"
                initialValues={{
                  staffAssessment: dispute.staffAssessment ?? '',
                  resolution: dispute.resolution ?? undefined,
                  resolvedAmount: dispute.resolvedAmount !== undefined ? dispute.resolvedAmount : undefined,
                }}
                onFinish={handleAssessmentSubmit}
              >
                <Form.Item label="Staff Assessment" name="staffAssessment">
                  <Input.TextArea rows={4} placeholder="Enter staff assessment..." />
                </Form.Item>
                <Form.Item label="Resolution" name="resolution">
                  <Select placeholder="Select resolution" options={RESOLUTION_OPTIONS} allowClear />
                </Form.Item>
                <Form.Item label="Resolved Amount (cents)" name="resolvedAmount">
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0}
                    precision={0}
                    placeholder="Amount in cents"
                  />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={updateDispute.isPending}>
                    Update Assessment
                  </Button>
                </Form.Item>
              </Form>
            </Card>
          )}
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Status" style={{ marginBottom: 16 }}>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <Tag
                color={DISPUTE_STATUS_COLORS[dispute.status]}
                style={{ fontSize: 16, padding: '4px 16px' }}
              >
                {DISPUTE_STATUS_LABELS[dispute.status]}
              </Tag>
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {nextStatus && (
                <Button
                  type="primary"
                  block
                  loading={updateDispute.isPending}
                  onClick={() => handleStatusTransition(nextStatus)}
                >
                  Move to {DISPUTE_STATUS_LABELS[nextStatus]}
                </Button>
              )}
              {canReject && (
                <Button
                  danger
                  block
                  loading={updateDispute.isPending}
                  onClick={() => handleStatusTransition('rejected')}
                >
                  Reject
                </Button>
              )}
            </div>
          </Card>

          <Card title="Related" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Order ID">
                <a href={`/orders/${dispute.orderId}`}>{dispute.orderId}</a>
              </Descriptions.Item>
              <Descriptions.Item label="Payment ID">
                <a href={`/payments/${dispute.paymentId}`}>{dispute.paymentId}</a>
              </Descriptions.Item>
              {dispute.ticketId && (
                <Descriptions.Item label="Ticket ID">{dispute.ticketId}</Descriptions.Item>
              )}
              {dispute.approvedBy && (
                <Descriptions.Item label="Approved By">{dispute.approvedBy}</Descriptions.Item>
              )}
            </Descriptions>
          </Card>

          <Card title="Timeline">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Created">{formatDateTime(dispute.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Updated">{formatDateTime(dispute.updatedAt)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
