'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Form, Input, Button, Typography, App } from 'antd';
import { LockOutlined, MailOutlined, SafetyOutlined } from '@ant-design/icons';
import { useAuth } from '@/lib/auth/useAuth';
import { api } from '@/lib/api/client';
import { setAccessToken, setRefreshToken } from '@/lib/api/tokenStorage';

const { Title, Text } = Typography;

export default function LoginPage(): React.ReactNode {
  const [loading, setLoading] = useState(false);
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();
  const { message } = App.useApp();

  // Redirect if already authenticated
  if (isAuthenticated) {
    router.replace('/');
    return null;
  }

  const handleLogin = async (values: { email: string; password: string }): Promise<void> => {
    setLoading(true);
    try {
      const result = await login(values.email, values.password);
      if (result.mfaRequired && result.mfaToken) {
        setMfaToken(result.mfaToken);
        setMfaStep(true);
      } else {
        router.push('/');
      }
    } catch {
      message.error('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleMfa = async (values: { totpCode: string }): Promise<void> => {
    setLoading(true);
    try {
      const res = await api.post<{
        status: number;
        data: { accessToken: string; refreshToken: string };
      }>('/auth/mfa-verify', {
        mfaToken,
        totpCode: values.totpCode,
      });
      setAccessToken(res.data.data.accessToken);
      setRefreshToken(res.data.data.refreshToken);
      router.push('/');
      // Force a page reload to trigger auth restore
      window.location.href = '/';
    } catch {
      message.error('Invalid verification code');
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
        background: '#f0f2f5',
      }}
    >
      <Card style={{ width: 400, boxShadow: '0 2px 8px rgba(0,0,0,0.09)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={2} style={{ marginBottom: 4 }}>
            QEGOS
          </Title>
          <Text type="secondary">Admin Dashboard</Text>
        </div>

        {!mfaStep ? (
          <Form layout="vertical" onFinish={handleLogin} autoComplete="off">
            <Form.Item
              name="email"
              rules={[
                { required: true, message: 'Please enter your email' },
                { type: 'email', message: 'Please enter a valid email' },
              ]}
            >
              <Input prefix={<MailOutlined />} placeholder="Email" size="large" />
            </Form.Item>
            <Form.Item
              name="password"
              rules={[{ required: true, message: 'Please enter your password' }]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="Password" size="large" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block size="large">
                Sign In
              </Button>
            </Form.Item>
          </Form>
        ) : (
          <Form layout="vertical" onFinish={handleMfa} autoComplete="off">
            <Text style={{ display: 'block', marginBottom: 16 }}>
              Enter the 6-digit code from your authenticator app.
            </Text>
            <Form.Item
              name="totpCode"
              rules={[
                { required: true, message: 'Please enter the verification code' },
                { len: 6, message: 'Code must be 6 digits' },
              ]}
            >
              <Input
                prefix={<SafetyOutlined />}
                placeholder="000000"
                size="large"
                maxLength={6}
              />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block size="large">
                Verify
              </Button>
            </Form.Item>
            <Button type="link" onClick={() => setMfaStep(false)} block>
              Back to login
            </Button>
          </Form>
        )}
      </Card>
    </div>
  );
}
