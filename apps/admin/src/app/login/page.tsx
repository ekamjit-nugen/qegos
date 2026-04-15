'use client';

import { useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, Form, Input, Button, Typography, App, Table, Tag } from 'antd';
import type { FormInstance } from 'antd';
import { LockOutlined, MailOutlined, SafetyOutlined, LoginOutlined } from '@ant-design/icons';
import { useAuth } from '@/lib/auth/useAuth';
import { api } from '@/lib/api/client';
import { setAccessToken, setRefreshToken } from '@/lib/api/tokenStorage';

const { Title, Text } = Typography;
const DEFAULT_PASSWORD = 'Password1!';

// ─── Dev Credentials ──────────────────────────────────────────────────────────

const DEV_ACCOUNTS = [
  { email: 'superadmin@qegos.com.au', role: 'Super Admin', color: 'red' },
  { email: 'admin@qegos.com.au', role: 'Admin', color: 'volcano' },
  { email: 'manager@qegos.com.au', role: 'Office Manager', color: 'orange' },
  { email: 'senior@qegos.com.au', role: 'Senior Staff', color: 'gold' },
  { email: 'staff1@qegos.com.au', role: 'Staff', color: 'lime' },
  { email: 'staff2@qegos.com.au', role: 'Staff', color: 'lime' },
  { email: 'john.doe@example.com', role: 'Client', color: 'blue' },
  { email: 'jane.smith@example.com', role: 'Client', color: 'blue' },
  { email: 'mike.chen@example.com', role: 'Client', color: 'blue' },
  { email: 'student@example.com', role: 'Student', color: 'purple' },
];

function DevCredentials({ onSelect }: { onSelect: (email: string) => void }): ReactNode {
  const { message } = App.useApp();

  const columns = [
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (email: string) => (
        <Button
          type="link"
          size="small"
          icon={<LoginOutlined />}
          onClick={() => {
            onSelect(email);
            message.success(`Filled: ${email}`);
          }}
          style={{ padding: 0, height: 'auto', fontSize: 12 }}
        >
          {email}
        </Button>
      ),
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role: string, record: { color: string }) => (
        <Tag color={record.color}>{role}</Tag>
      ),
    },
  ];

  return (
    <Card
      size="small"
      style={{ width: 400, marginTop: 16 }}
      title={
        <Text type="secondary" style={{ fontSize: 13 }}>
          Click a row to fill credentials
        </Text>
      }
    >
      <Table
        dataSource={DEV_ACCOUNTS}
        columns={columns}
        rowKey="email"
        size="small"
        pagination={false}
        style={{ fontSize: 12 }}
      />
    </Card>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────

export default function LoginPage(): ReactNode {
  const [form] = Form.useForm<{ email: string; password: string }>();
  const [loading, setLoading] = useState(false);
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();
  const { message } = App.useApp();

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
      window.location.href = '/';
    } catch {
      message.error('Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleCredentialSelect = (email: string): void => {
    form.setFieldsValue({ email, password: DEFAULT_PASSWORD });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#f5f5f5',
      }}
    >
      <Card style={{ width: 400, borderRadius: 8, border: '1px solid #f0f0f0' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <Title level={3} style={{ marginBottom: 4, color: '#1677ff' }}>
            QEGOS
          </Title>
          <Text type="secondary">Admin Dashboard</Text>
        </div>

        {!mfaStep ? (
          <Form form={form} layout="vertical" onFinish={handleLogin} autoComplete="off">
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
            <Form.Item
              name="password"
              label="Password"
              rules={[{ required: true, message: 'Please enter your password' }]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="Password" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block>
                Sign In
              </Button>
            </Form.Item>
            <div style={{ textAlign: 'center' }}>
              <Link href="/forgot-password">
                <Button type="link">Forgot password?</Button>
              </Link>
            </div>
          </Form>
        ) : (
          <Form layout="vertical" onFinish={handleMfa} autoComplete="off">
            <Text style={{ display: 'block', marginBottom: 16 }}>
              Enter the 6-digit code from your authenticator app.
            </Text>
            <Form.Item
              name="totpCode"
              label="Verification Code"
              rules={[
                { required: true, message: 'Please enter the verification code' },
                { len: 6, message: 'Code must be 6 digits' },
              ]}
            >
              <Input
                prefix={<SafetyOutlined />}
                placeholder="000000"
                maxLength={6}
              />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block>
                Verify
              </Button>
            </Form.Item>
            <Button type="link" onClick={() => { setMfaStep(false); }} block>
              Back to login
            </Button>
          </Form>
        )}
      </Card>

      {process.env.NODE_ENV !== 'production' && (
        <DevCredentials onSelect={handleCredentialSelect} />
      )}
    </div>
  );
}
