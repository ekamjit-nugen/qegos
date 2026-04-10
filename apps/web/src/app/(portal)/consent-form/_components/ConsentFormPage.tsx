'use client';

/**
 * ConsentFormPage — QETAX-style multi-step intake form for the client
 * portal. Mirrors the sections from the qetax-website source
 * (consent-form.tsx) but rebuilt on Ant Design to match the rest of
 * apps/web.
 *
 * SECURITY: accountNumber / bsb / tfnAbnAcn / dateOfBirth are sent as
 * plaintext over TLS and encrypted at rest by the server (AES-256-GCM)
 * the moment the request lands. After submit, the ONLY values the UI
 * ever sees back are the last-4 / year projections. No decrypt path
 * exists from the portal.
 */

import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Form,
  Input,
  Radio,
  Result,
  Select,
  Space,
  Steps,
  Typography,
  theme,
} from 'antd';
import { SafetyOutlined, LockOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useSubmitConsentForm, useMyConsentForms } from '@/hooks/useConsentForm';
import {
  AU_STATES,
  WORK_TYPES,
  PRIMARY_ID_TYPES,
  PRIMARY_ID_LABELS,
  SECONDARY_ID_TYPES,
  SECONDARY_ID_LABELS,
  type CreateConsentFormRequest,
  type ConsentFormSubmission,
} from '@/types/consentForm';

const { Title, Text, Paragraph } = Typography;

type Step =
  | 'personal'
  | 'address'
  | 'banking'
  | 'primary_id'
  | 'secondary_id'
  | 'consent';

const STEPS: Array<{ key: Step; title: string }> = [
  { key: 'personal', title: 'Personal Details' },
  { key: 'address', title: 'Address' },
  { key: 'banking', title: 'Tax & Banking' },
  { key: 'primary_id', title: 'Primary ID' },
  { key: 'secondary_id', title: 'Secondary ID' },
  { key: 'consent', title: 'Consent' },
];

/**
 * Fields owned by each step. Used to scope the AntD `form.validateFields`
 * call so "Next" only validates the current step, not the entire form.
 */
const STEP_FIELDS: Record<Step, string[]> = {
  personal: ['firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'gender'],
  address: ['houseNumber', 'streetName', 'city', 'postCode', 'state'],
  banking: ['workType', 'tfnAbnAcn', 'bsb', 'accountNumber', 'accountName'],
  primary_id: ['primaryIdType', 'primaryIdUrl'],
  secondary_id: ['secondaryIdType', 'secondaryIdUrl'],
  consent: ['consentAgreement'],
};

interface FormValues {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: Dayjs;
  gender?: 'male' | 'female';

  houseNumber?: string;
  streetName?: string;
  city?: string;
  postCode?: string;
  state?: (typeof AU_STATES)[number];

  workType?: (typeof WORK_TYPES)[number];
  tfnAbnAcn?: string;
  bsb?: string;
  accountNumber?: string;
  accountName?: string;

  primaryIdType?: (typeof PRIMARY_ID_TYPES)[number];
  primaryIdUrl?: string;
  secondaryIdType?: (typeof SECONDARY_ID_TYPES)[number];
  secondaryIdUrl?: string;

  consentAgreement?: boolean;
}

export function ConsentFormPage(): React.ReactNode {
  const [form] = Form.useForm<FormValues>();
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [submitted, setSubmitted] = useState<ConsentFormSubmission | null>(null);
  const submit = useSubmitConsentForm();
  const myForms = useMyConsentForms();
  const { token: t } = theme.useToken();

  const currentStep = STEPS[currentStepIdx];

  // ─── Stepper navigation ────────────────────────────────────────────
  const handleNext = async (): Promise<void> => {
    try {
      await form.validateFields(STEP_FIELDS[currentStep.key]);
      setCurrentStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
    } catch {
      // validation errors render inline via AntD Form
    }
  };

  const handlePrev = (): void => {
    setCurrentStepIdx((i) => Math.max(i - 1, 0));
  };

  const handleSubmit = async (): Promise<void> => {
    try {
      const values = await form.validateFields();
      const dob = values.dateOfBirth;
      if (!dob) throw new Error('Date of birth is required');

      const payload: CreateConsentFormRequest = {
        firstName: values.firstName!,
        lastName: values.lastName!,
        email: values.email!,
        phone: values.phone!,
        dateOfBirth: dob.format('YYYY-MM-DD'),
        gender: values.gender!,

        houseNumber: values.houseNumber!,
        streetName: values.streetName!,
        city: values.city!,
        postCode: values.postCode!,
        state: values.state!,

        workType: values.workType!,
        tfnAbnAcn: values.tfnAbnAcn!,
        bsb: values.bsb!,
        accountNumber: values.accountNumber!,
        accountName: values.accountName!,

        primaryIdType: values.primaryIdType!,
        primaryIdUrl: values.primaryIdUrl!,
        secondaryIdType: values.secondaryIdType!,
        secondaryIdUrl: values.secondaryIdUrl!,

        consentAgreement: true,
      };

      const result = await submit.mutateAsync(payload);
      setSubmitted(result);
      form.resetFields();
      setCurrentStepIdx(0);
    } catch {
      // surfaced via AntD Form errors or mutation.isError below
    }
  };

  // ─── Success screen ────────────────────────────────────────────────
  if (submitted) {
    return (
      <Card>
        <Result
          status="success"
          title="Consent form submitted"
          subTitle={
            <Space direction="vertical" size={2}>
              <Text>Reference: {submitted._id}</Text>
              <Text type="secondary">
                Account ending •••• {submitted.accountNumberLast4} &nbsp;·&nbsp;
                BSB •••• {submitted.bsbLast4} &nbsp;·&nbsp;
                {submitted.workType} •••• {submitted.tfnAbnAcnLast4}
              </Text>
              <Text type="secondary">
                Your sensitive details have been encrypted at rest. QEGOS staff
                will only ever see the last 4 digits shown above.
              </Text>
            </Space>
          }
          extra={[
            <Button
              key="another"
              type="primary"
              onClick={(): void => setSubmitted(null)}
            >
              Submit another
            </Button>,
          ]}
        />
      </Card>
    );
  }

  // ─── Main wizard ───────────────────────────────────────────────────
  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      {/* Header */}
      <div>
        <Title level={3} style={{ margin: 0 }}>
          File your tax — Consent form
        </Title>
        <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
          Complete the intake below. Your TFN, BSB, and account number are
          encrypted on our servers using AES-256-GCM and are never displayed in
          full after submission.
        </Paragraph>
      </div>

      {/* Security banner */}
      <Alert
        type="info"
        showIcon
        icon={<LockOutlined />}
        message="Your financial details are encrypted at rest"
        description="TFN / ABN / ACN, BSB, account number, and date of birth are encrypted immediately on submission. After submit, QEGOS staff will only see the last 4 digits."
      />

      {/* Previously submitted — status info */}
      {(myForms.data?.length ?? 0) > 0 && (
        <Alert
          type="success"
          showIcon
          icon={<SafetyOutlined />}
          message={`You have ${myForms.data?.length} previous submission${
            myForms.data && myForms.data.length > 1 ? 's' : ''
          }.`}
          description={
            myForms.data && myForms.data.length > 0 && (
              <Space direction="vertical" size={2}>
                {myForms.data.slice(0, 3).map((s) => (
                  <Text key={s._id} type="secondary" style={{ fontSize: 12 }}>
                    {new Date(s.submittedAt).toLocaleDateString()} ·{' '}
                    {s.workType} •••• {s.tfnAbnAcnLast4} · Account ••••{' '}
                    {s.accountNumberLast4}
                  </Text>
                ))}
              </Space>
            )
          }
        />
      )}

      <Card>
        <Steps
          current={currentStepIdx}
          items={STEPS.map((s) => ({ title: s.title }))}
          size="small"
          style={{ marginBottom: t.marginLG }}
          responsive
        />

        <Form<FormValues>
          form={form}
          layout="vertical"
          autoComplete="off"
          initialValues={{ consentAgreement: false }}
        >
          {/* ─── STEP 1: Personal Details ───────────────────────── */}
          <div style={{ display: currentStep.key === 'personal' ? 'block' : 'none' }}>
            <Form.Item
              name="firstName"
              label="First name"
              rules={[{ required: true, message: 'First name is required' }]}
            >
              <Input placeholder="Jane" maxLength={100} />
            </Form.Item>
            <Form.Item
              name="lastName"
              label="Last name"
              rules={[{ required: true, message: 'Last name is required' }]}
            >
              <Input placeholder="Doe" maxLength={100} />
            </Form.Item>
            <Form.Item
              name="email"
              label="Email"
              rules={[
                { required: true, message: 'Email is required' },
                { type: 'email', message: 'Enter a valid email' },
              ]}
            >
              <Input placeholder="jane@example.com" />
            </Form.Item>
            <Form.Item
              name="phone"
              label="Phone"
              rules={[
                { required: true, message: 'Phone is required' },
                { pattern: /^\d{10}$/, message: 'Phone must be exactly 10 digits' },
              ]}
            >
              <Input placeholder="0412345678" maxLength={10} />
            </Form.Item>
            <Form.Item
              name="dateOfBirth"
              label="Date of birth"
              extra="Encrypted at rest. Only the year is displayed after submission."
              rules={[{ required: true, message: 'Date of birth is required' }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
                disabledDate={(d): boolean => d && d.isAfter(dayjs())}
              />
            </Form.Item>
            <Form.Item
              name="gender"
              label="Gender"
              rules={[{ required: true, message: 'Gender is required' }]}
            >
              <Radio.Group>
                <Radio value="male">Male</Radio>
                <Radio value="female">Female</Radio>
              </Radio.Group>
            </Form.Item>
          </div>

          {/* ─── STEP 2: Address ────────────────────────────────── */}
          <div style={{ display: currentStep.key === 'address' ? 'block' : 'none' }}>
            <Form.Item
              name="houseNumber"
              label="House / unit number"
              rules={[{ required: true, message: 'House number is required' }]}
            >
              <Input maxLength={20} />
            </Form.Item>
            <Form.Item
              name="streetName"
              label="Street name"
              rules={[{ required: true, message: 'Street name is required' }]}
            >
              <Input maxLength={200} />
            </Form.Item>
            <Form.Item
              name="city"
              label="Suburb / city"
              rules={[{ required: true, message: 'City is required' }]}
            >
              <Input maxLength={100} />
            </Form.Item>
            <Form.Item
              name="postCode"
              label="Post code"
              rules={[
                { required: true, message: 'Post code is required' },
                { pattern: /^\d{4}$/, message: 'Post code must be 4 digits' },
              ]}
            >
              <Input maxLength={4} placeholder="2000" />
            </Form.Item>
            <Form.Item
              name="state"
              label="State"
              rules={[{ required: true, message: 'State is required' }]}
            >
              <Select
                placeholder="Select state"
                options={AU_STATES.map((s) => ({ label: s, value: s }))}
              />
            </Form.Item>
          </div>

          {/* ─── STEP 3: Tax & Banking ─────────────────────────── */}
          <div style={{ display: currentStep.key === 'banking' ? 'block' : 'none' }}>
            <Alert
              type="warning"
              showIcon
              icon={<LockOutlined />}
              message="Encrypted fields"
              description="TFN / ABN / ACN, BSB, and account number are sent over HTTPS and encrypted on the server with AES-256-GCM before storage. Only the last 4 digits are retrievable afterwards."
              style={{ marginBottom: 16 }}
            />
            <Form.Item
              name="workType"
              label="Work type"
              rules={[{ required: true, message: 'Work type is required' }]}
            >
              <Select
                placeholder="TFN / ABN / ACN"
                options={WORK_TYPES.map((w) => ({ label: w, value: w }))}
              />
            </Form.Item>
            <Form.Item
              noStyle
              shouldUpdate={(prev: FormValues, next: FormValues): boolean =>
                prev.workType !== next.workType
              }
            >
              {({ getFieldValue }): React.ReactNode => {
                const wt = getFieldValue('workType') as string | undefined;
                const expectedLen = wt === 'ABN' ? 11 : wt === 'TFN' || wt === 'ACN' ? 9 : undefined;
                return (
                  <Form.Item
                    name="tfnAbnAcn"
                    label={`${wt ?? 'TFN/ABN/ACN'} number`}
                    rules={[
                      { required: true, message: 'Number is required' },
                      { pattern: /^\d+$/, message: 'Digits only' },
                      ...(expectedLen
                        ? [
                            {
                              len: expectedLen,
                              message: `${wt} must be exactly ${expectedLen} digits`,
                            },
                          ]
                        : []),
                    ]}
                  >
                    <Input.Password
                      placeholder={expectedLen ? `${expectedLen}-digit number` : '9 or 11 digit number'}
                      maxLength={expectedLen ?? 11}
                      visibilityToggle
                    />
                  </Form.Item>
                );
              }}
            </Form.Item>
            <Form.Item
              name="bsb"
              label="BSB"
              rules={[
                { required: true, message: 'BSB is required' },
                { pattern: /^\d{6}$/, message: 'BSB must be exactly 6 digits' },
              ]}
            >
              <Input placeholder="062123" maxLength={6} />
            </Form.Item>
            <Form.Item
              name="accountNumber"
              label="Account number"
              rules={[
                { required: true, message: 'Account number is required' },
                { pattern: /^\d{4,10}$/, message: 'Account number must be 4-10 digits' },
              ]}
            >
              <Input.Password maxLength={10} visibilityToggle />
            </Form.Item>
            <Form.Item
              name="accountName"
              label="Account name"
              rules={[{ required: true, message: 'Account name is required' }]}
            >
              <Input maxLength={200} />
            </Form.Item>
          </div>

          {/* ─── STEP 4: Primary ID ─────────────────────────────── */}
          <div style={{ display: currentStep.key === 'primary_id' ? 'block' : 'none' }}>
            <Paragraph type="secondary">
              Accepted documents: Australian full birth certificate, Australian
              passport, Australian citizenship certificate, Register of
              Citizenship by Descent extract, or foreign passport.
            </Paragraph>
            <Form.Item
              name="primaryIdType"
              label="Document type"
              rules={[{ required: true, message: 'Document type is required' }]}
            >
              <Select
                placeholder="Select document type"
                options={PRIMARY_ID_TYPES.map((v) => ({
                  label: PRIMARY_ID_LABELS[v],
                  value: v,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="primaryIdUrl"
              label="Document URL"
              extra="Paste the URL of your uploaded ID. Upload it via Document Vault first, then copy the link here."
              rules={[{ required: true, message: 'Document URL is required' }]}
            >
              <Input placeholder="https://..." />
            </Form.Item>
          </div>

          {/* ─── STEP 5: Secondary ID ───────────────────────────── */}
          <div style={{ display: currentStep.key === 'secondary_id' ? 'block' : 'none' }}>
            <Paragraph type="secondary">
              Accepted documents: National photo ID, foreign government ID,
              marriage certificate, driver&apos;s licence, or current bank
              statement / card.
            </Paragraph>
            <Form.Item
              name="secondaryIdType"
              label="Document type"
              rules={[{ required: true, message: 'Document type is required' }]}
            >
              <Select
                placeholder="Select document type"
                options={SECONDARY_ID_TYPES.map((v) => ({
                  label: SECONDARY_ID_LABELS[v],
                  value: v,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="secondaryIdUrl"
              label="Document URL"
              rules={[{ required: true, message: 'Document URL is required' }]}
            >
              <Input placeholder="https://..." />
            </Form.Item>
          </div>

          {/* ─── STEP 6: Consent ────────────────────────────────── */}
          <div style={{ display: currentStep.key === 'consent' ? 'block' : 'none' }}>
            <Alert
              type="info"
              message="Final step"
              description="Please read and accept the consent below to submit your intake form."
              style={{ marginBottom: 16 }}
            />
            <Form.Item
              name="consentAgreement"
              valuePropName="checked"
              rules={[
                {
                  validator: (_r, v: boolean): Promise<void> =>
                    v
                      ? Promise.resolve()
                      : Promise.reject(new Error('You must accept to submit')),
                },
              ]}
            >
              <Checkbox>
                I agree to share my financial information with{' '}
                <strong>Quintessential Accounting &amp; Taxation</strong>. I
                authorise Jasmine Kaur and Quintessential Accounting &amp;
                Taxation to access my ATO account, file returns, and act on my
                behalf.
              </Checkbox>
            </Form.Item>
          </div>

          {/* Error from mutation */}
          {submit.isError && (
            <Alert
              type="error"
              showIcon
              message="Submission failed"
              description={
                submit.error instanceof Error
                  ? submit.error.message
                  : 'Please try again.'
              }
              style={{ marginTop: 16 }}
            />
          )}

          {/* Navigation buttons */}
          <div
            style={{
              marginTop: 24,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <Button onClick={handlePrev} disabled={currentStepIdx === 0}>
              Previous
            </Button>
            {currentStepIdx < STEPS.length - 1 ? (
              <Button type="primary" onClick={handleNext}>
                Next
              </Button>
            ) : (
              <Button
                type="primary"
                onClick={handleSubmit}
                loading={submit.isPending}
              >
                Submit form
              </Button>
            )}
          </div>
        </Form>
      </Card>
    </Space>
  );
}
