'use client';

import { Suspense, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, Form, Input, Button, Typography, App, Result } from 'antd';
import { LockOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { api } from '@/lib/api/client';

const { Title, Text } = Typography;

function ResetPasswordForm(): ReactNode {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const { message } = App.useApp();

  if (!token) {
    return (
      <Result
        status="error"
        title="Invalid or missing token"
        subTitle="The reset link is invalid. Please request a new one."
        extra={
          <Link href="/forgot-password">
            <Button type="primary">Request new link</Button>
          </Link>
        }
      />
    );
  }

  const handleSubmit = async (values: {
    password: string;
    confirm: string;
  }): Promise<void> => {
    if (values.password !== values.confirm) {
      message.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        token,
        password: values.password,
      });
      setDone(true);
      setTimeout(() => { router.push('/login'); }, 2500);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data
          ?.message ?? 'Reset link is invalid or expired';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <Result
        status="success"
        title="Password reset"
        subTitle="You can now sign in with your new password. Redirecting..."
        extra={
          <Link href="/login">
            <Button type="primary">Sign in</Button>
          </Link>
        }
      />
    );
  }

  return (
    <>
      <Text style={{ display: 'block', marginBottom: 16 }}>
        Enter a new password for your account.
      </Text>
      <Form layout="vertical" onFinish={handleSubmit} autoComplete="off">
        <Form.Item
          name="password"
          label="New password"
          rules={[
            { required: true, message: 'Please enter a password' },
            { min: 8, message: 'Must be at least 8 characters' },
          ]}
        >
          <Input.Password prefix={<LockOutlined />} placeholder="New password" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="Confirm password"
          dependencies={['password']}
          rules={[
            { required: true, message: 'Please confirm your password' },
            ({ getFieldValue }) => ({
              validator(_, value): Promise<void> {
                if (!value || getFieldValue('password') === value) return Promise.resolve();
                return Promise.reject(new Error('Passwords do not match'));
              },
            }),
          ]}
        >
          <Input.Password prefix={<LockOutlined />} placeholder="Confirm password" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            Reset password
          </Button>
        </Form.Item>
        <div style={{ textAlign: 'center' }}>
          <Link href="/login">
            <Button type="link" icon={<ArrowLeftOutlined />}>
              Back to sign in
            </Button>
          </Link>
        </div>
      </Form>
    </>
  );
}

export default function ResetPasswordPage(): ReactNode {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#f5f5f5',
      }}
    >
      <Card style={{ width: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3} style={{ marginBottom: 4, color: '#1677ff' }}>
            QEGOS
          </Title>
          <Text type="secondary">Set a new password</Text>
        </div>
        <Suspense fallback={<div>Loading...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </Card>
    </div>
  );
}
