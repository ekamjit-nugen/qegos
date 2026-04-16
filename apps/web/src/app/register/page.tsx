'use client';

import { Suspense, useCallback, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, Form, Input, Button, Typography, App } from 'antd';
import { UserOutlined, MobileOutlined } from '@ant-design/icons';
import { useAuth } from '@/lib/auth/useAuth';

const { Title, Paragraph } = Typography;

interface RegisterFormValues {
  firstName: string;
  lastName: string;
  mobile: string;
  otp: string;
}

export default function RegisterPage(): ReactNode {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm(): ReactNode {
  const { register, sendOtp } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(!!searchParams.get('otp'));
  const [sendingOtp, setSendingOtp] = useState(false);
  const [form] = Form.useForm<RegisterFormValues>();

  // Pre-fill from OTP flow query params
  const initialMobile = searchParams.get('mobile') ?? '';
  const initialOtp = searchParams.get('otp') ?? '';

  const handleSendOtp = useCallback(async (): Promise<void> => {
    const mobile = form.getFieldValue('mobile') as string;
    if (!mobile) {
      message.warning('Please enter your mobile number first');
      return;
    }
    setSendingOtp(true);
    try {
      await sendOtp(mobile);
      setOtpSent(true);
      message.success('OTP sent to your mobile');
    } catch {
      message.error('Failed to send OTP');
    } finally {
      setSendingOtp(false);
    }
  }, [form, sendOtp, message]);

  const onFinish = useCallback(
    async (values: RegisterFormValues): Promise<void> => {
      setLoading(true);
      try {
        await register({
          firstName: values.firstName,
          lastName: values.lastName,
          mobile: values.mobile,
          otp: values.otp,
        });
        message.success('Registration successful!');
        router.replace('/');
      } catch {
        message.error('Registration failed. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [register, router, message],
  );

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
      <Card style={{ width: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3} style={{ marginBottom: 4, color: '#1677ff' }}>
            QEGOS
          </Title>
          <Paragraph>Create your client account</Paragraph>
        </div>

        <Form<RegisterFormValues>
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ mobile: initialMobile, otp: initialOtp }}
        >
          <Form.Item
            name="firstName"
            label="First Name"
            rules={[{ required: true, message: 'Please enter your first name' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="First name" />
          </Form.Item>

          <Form.Item
            name="lastName"
            label="Last Name"
            rules={[{ required: true, message: 'Please enter your last name' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="Last name" />
          </Form.Item>

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
            <Input
              prefix={<MobileOutlined />}
              placeholder="+61412345678"
              addonAfter={
                <Button
                  type="link"
                  size="small"
                  loading={sendingOtp}
                  onClick={handleSendOtp}
                  style={{ padding: 0 }}
                >
                  {otpSent ? 'Resend OTP' : 'Send OTP'}
                </Button>
              }
            />
          </Form.Item>

          <Form.Item
            name="otp"
            label="OTP"
            rules={[
              { required: true, message: 'Please enter the OTP' },
              { len: 6, message: 'OTP must be 6 digits' },
            ]}
          >
            <Input placeholder="000000" maxLength={6} />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Create Account
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <Button
              type="link"
              onClick={() => {
                router.push('/login');
              }}
            >
              Already have an account? Sign in
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}
