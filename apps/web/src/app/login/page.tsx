'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Tabs, Form, Input, Button, Typography, App } from 'antd';
import { MobileOutlined, MailOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '@/lib/auth/useAuth';

const { Title } = Typography;

interface EmailFormValues {
  email: string;
  password: string;
}

interface MobileFormValues {
  mobile: string;
}

interface OtpFormValues {
  otp: string;
}

function EmailLoginTab(): ReactNode {
  const { login } = useAuth();
  const router = useRouter();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  const onFinish = useCallback(
    async (values: EmailFormValues): Promise<void> => {
      setLoading(true);
      try {
        await login(values.email, values.password);
        router.replace('/');
      } catch {
        message.error('Invalid email or password');
      } finally {
        setLoading(false);
      }
    },
    [login, router, message],
  );

  return (
    <Form<EmailFormValues> layout="vertical" onFinish={onFinish}>
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
    </Form>
  );
}

function MobileLoginTab(): ReactNode {
  const { sendOtp, verifyOtp, loginWithOtp } = useAuth();
  const router = useRouter();
  const { message } = App.useApp();
  const [step, setStep] = useState<'mobile' | 'otp'>('mobile');
  const [mobile, setMobile] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleSendOtp = useCallback(
    async (values: MobileFormValues): Promise<void> => {
      setSendingOtp(true);
      try {
        await sendOtp(values.mobile);
        setMobile(values.mobile);
        setStep('otp');
        message.success('OTP sent to your mobile');
      } catch {
        message.error('Failed to send OTP. Please check your mobile number.');
      } finally {
        setSendingOtp(false);
      }
    },
    [sendOtp, message],
  );

  const handleVerifyOtp = useCallback(
    async (values: OtpFormValues): Promise<void> => {
      setVerifying(true);
      try {
        const result = await verifyOtp(mobile, values.otp);
        if (!result.userExists) {
          // New user — redirect to register
          router.replace(`/register?mobile=${encodeURIComponent(mobile)}&otp=${encodeURIComponent(values.otp)}`);
          return;
        }
        // Existing user — log in with OTP
        await loginWithOtp(mobile, values.otp);
        router.replace('/');
      } catch {
        message.error('Invalid OTP. Please try again.');
      } finally {
        setVerifying(false);
      }
    },
    [mobile, verifyOtp, loginWithOtp, router, message],
  );

  if (step === 'mobile') {
    return (
      <Form<MobileFormValues> layout="vertical" onFinish={handleSendOtp}>
        <Form.Item
          name="mobile"
          label="Mobile Number"
          rules={[
            { required: true, message: 'Please enter your mobile number' },
            {
              pattern: /^\+61\d{9}$/,
              message: 'Enter in format +61412345678',
            },
          ]}
        >
          <Input prefix={<MobileOutlined />} placeholder="+61412345678" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={sendingOtp} block>
            Send OTP
          </Button>
        </Form.Item>
      </Form>
    );
  }

  return (
    <Form<OtpFormValues> layout="vertical" onFinish={handleVerifyOtp}>
      <Form.Item
        name="otp"
        label="Enter OTP"
        extra={`Sent to ${mobile}`}
        rules={[
          { required: true, message: 'Please enter the OTP' },
          { len: 6, message: 'OTP must be 6 digits' },
        ]}
      >
        <Input placeholder="000000" maxLength={6} />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" loading={verifying} block>
          Verify & Sign In
        </Button>
      </Form.Item>
      <Button type="link" block onClick={() => { setStep('mobile'); }}>
        Use a different number
      </Button>
    </Form>
  );
}

export default function LoginPage(): ReactNode {
  const tabItems = [
    {
      key: 'mobile',
      label: 'Mobile',
      children: <MobileLoginTab />,
    },
    {
      key: 'email',
      label: 'Email',
      children: <EmailLoginTab />,
    },
  ];

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
          <Title level={5} style={{ marginTop: 0, fontWeight: 'normal' }}>
            Client Portal
          </Title>
        </div>
        <Tabs items={tabItems} centered />
      </Card>
    </div>
  );
}
