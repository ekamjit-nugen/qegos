'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Form, Input, Button, Typography, App } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/useAuth';

const { Title, Text } = Typography;

export default function ChangePasswordPage(): ReactNode {
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();
  const { logout } = useAuth();
  const router = useRouter();
  const [form] = Form.useForm();

  const handleSubmit = async (values: {
    currentPassword: string;
    newPassword: string;
    confirm: string;
  }): Promise<void> => {
    if (values.newPassword !== values.confirm) {
      message.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      message.success('Password changed. Please sign in again.');
      await logout();
      router.push('/login');
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data
          ?.message ?? 'Failed to change password';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 500 }}>
      <Title level={3}>Change Password</Title>
      <Text type="secondary">
        After changing, all other sessions will be signed out.
      </Text>

      <Card style={{ marginTop: 16 }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
        >
          <Form.Item
            name="currentPassword"
            label="Current password"
            rules={[{ required: true, message: 'Please enter your current password' }]}
          >
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="New password"
            rules={[
              { required: true, message: 'Please enter a new password' },
              { min: 8, message: 'Must be at least 8 characters' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="Confirm new password"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Please confirm your new password' },
              ({ getFieldValue }) => ({
                validator(_, value): Promise<void> {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error('Passwords do not match'));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              Change password
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
