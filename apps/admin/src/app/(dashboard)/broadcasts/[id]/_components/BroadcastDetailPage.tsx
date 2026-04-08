'use client';

import React from 'react';
import { Row, Col, Card, Descriptions, Tag, Spin, Empty, Button, App } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useCampaign, useSendCampaign } from '@/hooks/useBroadcasts';
import type { CampaignStatus } from '@/types/broadcast';
import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_COLORS } from '@/types/broadcast';
import { formatDateTime } from '@/lib/utils/format';

export function BroadcastDetailPage({ id }: { id: string }): React.ReactNode {
  const { data: campaign, isLoading } = useCampaign(id);
  const sendCampaign = useSendCampaign();
  const { message } = App.useApp();

  if (isLoading) { return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />; }
  if (!campaign) { return <Empty description="Campaign not found" />; }

  const handleSend = (): void => {
    sendCampaign.mutate(campaign._id, {
      onSuccess: () => {
        void message.success('Campaign sent successfully');
      },
      onError: () => {
        void message.error('Failed to send campaign');
      },
    });
  };

  const stats = [
    { label: 'Sent', value: campaign.sentCount },
    { label: 'Failed', value: campaign.failedCount },
    { label: 'Opened', value: campaign.openCount },
    { label: 'Clicked', value: campaign.clickCount },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>
          {campaign.name}{' '}
          <Tag color={CAMPAIGN_STATUS_COLORS[campaign.status as CampaignStatus]}>
            {CAMPAIGN_STATUS_LABELS[campaign.status as CampaignStatus] ?? campaign.status}
          </Tag>
        </h2>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Campaign Details" style={{ marginBottom: 16 }}>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="Name">{campaign.name}</Descriptions.Item>
              <Descriptions.Item label="Channel">
                <Tag>{campaign.channel}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Scheduled At">
                {campaign.scheduledAt ? formatDateTime(campaign.scheduledAt) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Total Recipients">{campaign.totalRecipients}</Descriptions.Item>
              <Descriptions.Item label="Created At">{formatDateTime(campaign.createdAt)}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Delivery Stats">
            <Row gutter={[16, 16]}>
              {stats.map((stat) => (
                <Col xs={12} sm={6} key={stat.label}>
                  <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <div style={{ fontSize: 28, fontWeight: 600 }}>{stat.value}</div>
                    <div style={{ color: '#8c8c8c', marginTop: 4 }}>{stat.label}</div>
                  </div>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Status" style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <Tag color={CAMPAIGN_STATUS_COLORS[campaign.status as CampaignStatus]} style={{ fontSize: 14, padding: '4px 12px' }}>
                {CAMPAIGN_STATUS_LABELS[campaign.status as CampaignStatus] ?? campaign.status}
              </Tag>
            </div>
            {campaign.status === 'draft' && (
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleSend}
                loading={sendCampaign.isPending}
              >
                Send Campaign
              </Button>
            )}
          </Card>

          <Card title="Timeline">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Created">{formatDateTime(campaign.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Updated">{formatDateTime(campaign.updatedAt)}</Descriptions.Item>
              <Descriptions.Item label="Scheduled">
                {campaign.scheduledAt ? formatDateTime(campaign.scheduledAt) : '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
