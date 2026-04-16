'use client';

import React from 'react';
import { Row, Col, Card, Descriptions, Tag, Spin, Empty } from 'antd';
import { useReferral } from '@/hooks/useReferrals';
import { REFERRAL_STATUS_LABELS, REFERRAL_STATUS_COLORS } from '@/types/referral';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils/format';

export function ReferralDetailPage({ id }: { id: string }): React.ReactNode {
  const { data: referral, isLoading } = useReferral(id);

  if (isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }
  if (!referral) {
    return <Empty description="Referral not found" />;
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Referral — {referral.referralCode}</h2>
        <Tag color={REFERRAL_STATUS_COLORS[referral.status]}>
          {REFERRAL_STATUS_LABELS[referral.status]}
        </Tag>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Referral Details" style={{ marginBottom: 16 }}>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="Referral Code">{referral.referralCode}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={REFERRAL_STATUS_COLORS[referral.status]}>
                  {REFERRAL_STATUS_LABELS[referral.status]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Reward Type">
                {referral.rewardType ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Referrer Reward">
                {referral.referrerRewardAmount !== undefined
                  ? formatCurrency(referral.referrerRewardAmount)
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Referee Reward">
                {referral.refereeRewardAmount !== undefined
                  ? formatCurrency(referral.refereeRewardAmount)
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Channel">{referral.channel ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Expires">
                {formatDate(referral.expiresAt)}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Reward Status" style={{ marginBottom: 16 }}>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="Referrer Rewarded">
                <Tag color={referral.referrerRewarded ? 'green' : 'default'}>
                  {referral.referrerRewarded ? 'Yes' : 'No'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Referee Rewarded">
                <Tag color={referral.refereeRewarded ? 'green' : 'default'}>
                  {referral.refereeRewarded ? 'Yes' : 'No'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Status" style={{ marginBottom: 16 }}>
            <Tag color={REFERRAL_STATUS_COLORS[referral.status]}>
              {REFERRAL_STATUS_LABELS[referral.status]}
            </Tag>
          </Card>

          <Card title="Participants" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Referrer">{referral.referrerId}</Descriptions.Item>
              <Descriptions.Item label="Referee">{referral.refereeId ?? '-'}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Timeline" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Created">
                {formatDateTime(referral.createdAt)}
              </Descriptions.Item>
              <Descriptions.Item label="Updated">
                {formatDateTime(referral.updatedAt)}
              </Descriptions.Item>
              <Descriptions.Item label="Expires">
                {formatDate(referral.expiresAt)}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
