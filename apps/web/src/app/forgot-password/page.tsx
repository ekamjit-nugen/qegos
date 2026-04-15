'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Card, Form, Input, Button, Typography, App, Result } from 'antd';
import { MailOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { api } from '@/lib/api/client';

const { Title, Text } = Typography;

export default function ForgotPasswordPage(): ReactNode {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { message } = App.useApp();

  const handleSubmit = async (values: { email: string }): Promise<void> => {
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: values.email });
      setSent(true);
    } catch {
      message.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
          <Text type="secondary">Reset your password</Text>
        </div>

        {sent ? (
          <Result
            status="success"
            title="Check your email"
            subTitle="If an account exists for that email, a password reset link has been sent. The link expires in 1 hour."
            extra={
              <Link href="/login">
                <Button type="primary" icon={<ArrowLeftOutlined />}>
                  Back to sign in
                </Button>
              </Link>
            }
          />
        ) : (
          <>
            <Text style={{ display: 'block', marginBottom: 16 }}>
              Enter your email and we&apos;ll send you a reset link.
            </Text>
            <Form layout="vertical" onFinish={handleSubmit} autoComplete="off">
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: 'Please enter your email' },
                  { type: 'email', message: 'Please enter a valid email' },
                ]}
              >
                <Input prefix={<MailOutlined />} placeholder="you@example.com" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} block>
                  Send reset link
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
        )}
      </Card>
    </div>
  );
}
