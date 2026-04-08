'use client';

import { useState } from 'react';
import { Row, Col, Card, Descriptions, Tag, Spin, Empty, Form, Input, Button, App } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { REVIEW_STATUS_LABELS_REP, REVIEW_STATUS_COLORS_REP } from '@/types/reputation';
import { useReview_Rep, useRespondToReview } from '@/hooks/useReputation';
import { formatDateTime } from '@/lib/utils/format';

export function ReputationDetailPage({ id }: { id: string }): React.ReactNode {
  const { data: review, isLoading } = useReview_Rep(id);
  const respondToReview = useRespondToReview();
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) { return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />; }
  if (!review) { return <Empty description="Review not found" />; }

  const handleRespond = async (): Promise<void> => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await respondToReview.mutateAsync({ id, response: values.adminResponse });
      message.success('Response submitted');
      form.resetFields();
    } catch {
      message.error('Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  };

  const showResponseForm = review.status === 'submitted' || review.status === 'flagged';

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Review</h2>
        <span style={{ fontSize: 18 }}>{'★'} {review.rating}</span>
        <Tag color={REVIEW_STATUS_COLORS_REP[review.status]}>
          {REVIEW_STATUS_LABELS_REP[review.status] ?? review.status}
        </Tag>
      </div>

      <Row gutter={[16, 16]}>
        {/* Left column */}
        <Col xs={24} lg={16}>
          <Card title="Review" style={{ marginBottom: 16 }}>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="Rating">{review.rating} / 5</Descriptions.Item>
              <Descriptions.Item label="NPS Score">{review.npsScore !== null && review.npsScore !== undefined ? `${review.npsScore} / 10` : '-'}</Descriptions.Item>
              <Descriptions.Item label="Comment" span={2}>{review.comment ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Tags" span={2}>
                {review.tags.length > 0
                  ? review.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Google Review Prompted">
                <Tag color={review.googleReviewPrompted ? 'blue' : 'default'}>
                  {review.googleReviewPrompted ? 'Yes' : 'No'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Google Review Clicked">
                <Tag color={review.googleReviewClicked ? 'blue' : 'default'}>
                  {review.googleReviewClicked ? 'Yes' : 'No'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Admin Response" style={{ marginBottom: 16 }}>
            {review.adminResponse && (
              <div style={{ marginBottom: 16, padding: 12, background: '#f6ffed', borderRadius: 6 }}>
                <strong>Current Response:</strong>
                <p style={{ margin: '8px 0 0' }}>{review.adminResponse}</p>
              </div>
            )}
            {showResponseForm && (
              <Form form={form} layout="vertical" onFinish={handleRespond}>
                <Form.Item
                  name="adminResponse"
                  label={review.adminResponse ? 'Update Response' : 'Write Response'}
                  rules={[{ required: true, message: 'Response is required' }]}
                >
                  <Input.TextArea rows={4} placeholder="Type your response to this review..." />
                </Form.Item>
                <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={submitting}>
                  Submit Response
                </Button>
              </Form>
            )}
            {!review.adminResponse && !showResponseForm && (
              <Empty description="No admin response" />
            )}
          </Card>
        </Col>

        {/* Right column */}
        <Col xs={24} lg={8}>
          <Card title="Status" style={{ marginBottom: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <Tag
                color={REVIEW_STATUS_COLORS_REP[review.status]}
                style={{ fontSize: 16, padding: '4px 16px' }}
              >
                {REVIEW_STATUS_LABELS_REP[review.status] ?? review.status}
              </Tag>
            </div>
          </Card>

          <Card title="Related" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="User ID">{review.userId}</Descriptions.Item>
              <Descriptions.Item label="Order ID">{review.orderId ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Staff ID">{review.staffId ?? '-'}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Timeline" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Created">{formatDateTime(review.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Updated">{formatDateTime(review.updatedAt)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
