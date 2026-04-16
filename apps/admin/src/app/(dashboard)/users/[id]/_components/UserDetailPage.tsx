'use client';

import { useState } from 'react';
import { Row, Col, Card, Descriptions, Tag, Spin, Empty, Button, App, Popconfirm } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { UserFormModal } from '../../_components/UserFormModal';
import { useUser, useToggleUserStatus } from '@/hooks/useUsers';
import { USER_TYPE_LABELS } from '@/types/user';
import { formatDate, formatPhone, fullName } from '@/lib/utils/format';

export function UserDetailPage({ id }: { id: string }): React.ReactNode {
  const { data: user, isLoading } = useUser(id);
  const toggleStatus = useToggleUserStatus();
  const { message } = App.useApp();
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }
  if (!user) {
    return <Empty description="User not found" />;
  }

  const handleToggleStatus = async (): Promise<void> => {
    try {
      await toggleStatus.mutateAsync({ id: user._id, status: !user.status });
      message.success(`User ${user.status ? 'deactivated' : 'activated'}`);
    } catch {
      message.error('Failed to update status');
    }
  };

  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h2 style={{ margin: 0 }}>{fullName(user.firstName, user.lastName)}</h2>
        <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
          Edit
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Personal Information">
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="First Name">{user.firstName}</Descriptions.Item>
              <Descriptions.Item label="Last Name">{user.lastName}</Descriptions.Item>
              <Descriptions.Item label="Email">{user.email}</Descriptions.Item>
              <Descriptions.Item label="Mobile">{formatPhone(user.mobile)}</Descriptions.Item>
              <Descriptions.Item label="Gender">{user.gender ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Date of Birth">
                {user.dateOfBirth ? formatDate(user.dateOfBirth) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Preferred Contact">
                {user.preferredContact ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Preferred Language">
                {user.preferredLanguage ?? '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Address" style={{ marginTop: 16 }}>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="Street">{user.address?.street ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Suburb">{user.address?.suburb ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="State">{user.address?.state ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Postcode">
                {user.address?.postcode ?? '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Account" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="User Type">
                <Tag>{USER_TYPE_LABELS[user.userType] ?? 'Unknown'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={user.status ? 'green' : 'red'}>
                  {user.status ? 'Active' : 'Inactive'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Referral Code">
                {user.referralCode ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Created">{formatDate(user.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Updated">{formatDate(user.updatedAt)}</Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 12 }}>
              <Popconfirm
                title={`${user.status ? 'Deactivate' : 'Activate'} this user?`}
                onConfirm={handleToggleStatus}
              >
                <Button danger={user.status} block loading={toggleStatus.isPending}>
                  {user.status ? 'Deactivate User' : 'Activate User'}
                </Button>
              </Popconfirm>
            </div>
          </Card>
        </Col>
      </Row>

      <UserFormModal open={editOpen} onClose={() => setEditOpen(false)} user={user} />
    </div>
  );
}
