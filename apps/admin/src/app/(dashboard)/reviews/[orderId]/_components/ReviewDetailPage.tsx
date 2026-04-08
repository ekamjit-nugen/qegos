'use client';

import React, { useState } from 'react';
import { Row, Col, Card, Descriptions, Tag, Button, Spin, Empty, Space, Modal, Input, App } from 'antd';
import { useReview, useStartReview, useApproveReview, useRequestChanges, useRejectReview } from '@/hooks/useReviews';
import { REVIEW_STATUS_LABELS, REVIEW_STATUS_COLORS } from '@/types/review';
import type { ReviewStatus } from '@/types/review';
import { formatDate, formatDateTime } from '@/lib/utils/format';

export function ReviewDetailPage({ orderId }: { orderId: string }): React.ReactNode {
  const { data: review, isLoading } = useReview(orderId);
  const startReview = useStartReview();
  const approveReview = useApproveReview();
  const requestChanges = useRequestChanges();
  const rejectReview = useRejectReview();
  const { message } = App.useApp();

  const [changesModalOpen, setChangesModalOpen] = useState(false);
  const [changesText, setChangesText] = useState('');
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  if (isLoading) { return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />; }
  if (!review) { return <Empty description="Review not found" />; }

  const handleStart = async (): Promise<void> => {
    try {
      await startReview.mutateAsync(orderId);
      message.success('Review started');
    } catch {
      message.error('Failed to start review');
    }
  };

  const handleApprove = async (): Promise<void> => {
    try {
      await approveReview.mutateAsync({ orderId });
      message.success('Review approved');
    } catch {
      message.error('Failed to approve review');
    }
  };

  const handleRequestChanges = async (): Promise<void> => {
    if (!changesText.trim()) { return; }
    try {
      await requestChanges.mutateAsync({
        orderId,
        changes: [{ field: 'general', issue: changesText, instruction: changesText }],
      });
      message.success('Changes requested');
      setChangesModalOpen(false);
      setChangesText('');
    } catch {
      message.error('Failed to request changes');
    }
  };

  const handleReject = async (): Promise<void> => {
    if (!rejectReason.trim()) { return; }
    try {
      await rejectReview.mutateAsync({ orderId, reason: rejectReason });
      message.success('Review rejected');
      setRejectModalOpen(false);
      setRejectReason('');
    } catch {
      message.error('Failed to reject review');
    }
  };

  const renderStatusActions = (status: ReviewStatus): React.ReactNode => {
    switch (status) {
      case 'pending_review':
        return (
          <Button type="primary" loading={startReview.isPending} onClick={() => void handleStart()}>
            Start Review
          </Button>
        );
      case 'in_review':
        return (
          <Space wrap>
            <Button
              type="primary"
              style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
              loading={approveReview.isPending}
              onClick={() => void handleApprove()}
            >
              Approve
            </Button>
            <Button onClick={() => setChangesModalOpen(true)}>Request Changes</Button>
            <Button danger onClick={() => setRejectModalOpen(true)}>Reject</Button>
          </Space>
        );
      case 'changes_requested':
        return (
          <Button type="primary" loading={startReview.isPending} onClick={() => void handleStart()}>
            Start Review
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Review — Order {orderId}</h2>
        <Tag color={REVIEW_STATUS_COLORS[review.status]}>
          {REVIEW_STATUS_LABELS[review.status]}
        </Tag>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Checklist" style={{ marginBottom: 16 }}>
            {review.checklist.length > 0 ? (
              <div>
                {review.checklist.map((item, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '8px 12px',
                      marginBottom: 8,
                      background: '#fafafa',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                    }}
                  >
                    <Tag color={item.checked ? 'green' : 'default'} style={{ marginTop: 2 }}>
                      {item.checked ? 'Done' : 'Pending'}
                    </Tag>
                    <div>
                      <div>{item.item}</div>
                      {item.note && (
                        <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{item.note}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty description="No checklist items" />
            )}
          </Card>

          {review.changesRequested.length > 0 && (
            <Card
              title={`Changes Requested (${review.changesResolvedCount}/${review.changesRequested.length} resolved)`}
              style={{ marginBottom: 16 }}
            >
              {review.changesRequested.map((change, index) => (
                <div
                  key={index}
                  style={{
                    padding: '8px 12px',
                    marginBottom: 8,
                    background: change.resolvedAt ? '#f6ffed' : '#fffbe6',
                    borderRadius: 6,
                  }}
                >
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="Field">{change.field}</Descriptions.Item>
                    <Descriptions.Item label="Issue">{change.issue}</Descriptions.Item>
                    <Descriptions.Item label="Instruction">{change.instruction}</Descriptions.Item>
                    <Descriptions.Item label="Resolved">
                      {change.resolvedAt ? (
                        <Tag color="green">{formatDate(change.resolvedAt)}</Tag>
                      ) : (
                        <Tag color="orange">Pending</Tag>
                      )}
                    </Descriptions.Item>
                  </Descriptions>
                </div>
              ))}
            </Card>
          )}

          <Card title="Review Notes" style={{ marginBottom: 16 }}>
            <div style={{ padding: 12, background: '#fafafa', borderRadius: 6 }}>
              {review.reviewNotes ?? '-'}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Status" style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <Tag color={REVIEW_STATUS_COLORS[review.status]}>
                {REVIEW_STATUS_LABELS[review.status]}
              </Tag>
            </div>
            {renderStatusActions(review.status)}
          </Card>

          <Card title="Assignment" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Preparer">{review.preparerId}</Descriptions.Item>
              <Descriptions.Item label="Reviewer">{review.reviewerId}</Descriptions.Item>
              <Descriptions.Item label="Review Round">{review.reviewRound}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Timeline" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Created">{formatDateTime(review.createdAt)}</Descriptions.Item>
              {review.approvedAt && (
                <Descriptions.Item label="Approved">{formatDateTime(review.approvedAt)}</Descriptions.Item>
              )}
              {review.rejectedAt && (
                <Descriptions.Item label="Rejected">{formatDateTime(review.rejectedAt)}</Descriptions.Item>
              )}
              <Descriptions.Item label="Updated">{formatDateTime(review.updatedAt)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      <Modal
        title="Request Changes"
        open={changesModalOpen}
        onOk={() => void handleRequestChanges()}
        onCancel={() => { setChangesModalOpen(false); setChangesText(''); }}
        confirmLoading={requestChanges.isPending}
        okText="Submit"
      >
        <Input.TextArea
          rows={4}
          placeholder="Describe the changes required..."
          value={changesText}
          onChange={(e) => setChangesText(e.target.value)}
        />
      </Modal>

      <Modal
        title="Reject Review"
        open={rejectModalOpen}
        onOk={() => void handleReject()}
        onCancel={() => { setRejectModalOpen(false); setRejectReason(''); }}
        confirmLoading={rejectReview.isPending}
        okText="Reject"
        okButtonProps={{ danger: true }}
      >
        <Input.TextArea
          rows={4}
          placeholder="Provide a reason for rejection..."
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}
