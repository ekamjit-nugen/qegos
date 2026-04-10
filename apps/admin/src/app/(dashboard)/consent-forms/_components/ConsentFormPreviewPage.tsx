'use client';

/**
 * Consent Form — admin read-only preview.
 *
 * Mirrors the EXACT layout that clients see in apps/web, so admins can
 * understand what their clients are filling out without having to log
 * into the portal. All inputs are disabled and there is no submit
 * button. This is purely a visual reference — no data is loaded or
 * persisted.
 */

import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Divider,
  Form,
  Input,
  Radio,
  Select,
  Space,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  EyeOutlined,
  LockOutlined,
} from '@ant-design/icons';
import {
  AU_STATES,
  WORK_TYPES,
  PRIMARY_ID_TYPES,
  PRIMARY_ID_LABELS,
  SECONDARY_ID_TYPES,
  SECONDARY_ID_LABELS,
} from '@/types/consentForm';

const { Title, Text, Paragraph } = Typography;

export function ConsentFormPreviewPage(): React.ReactNode {
  const router = useRouter();

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={(): void => router.push('/consent-forms')}
          style={{ paddingLeft: 0, marginBottom: 8 }}
        >
          Back to submissions
        </Button>
        <Title level={3} style={{ margin: 0 }}>
          Consent Form — Preview
        </Title>
        <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
          This is the exact layout your clients see in the portal at{' '}
          <Text code>/consent-form</Text>. All inputs are disabled — this page
          is a visual reference only.
        </Paragraph>
      </div>

      <Alert
        type="info"
        showIcon
        icon={<EyeOutlined />}
        message="Read-only preview"
        description="Use this page to see the form your clients fill out. No data is loaded, no data is saved. To view actual submissions, return to the list page."
        style={{ marginBottom: 16 }}
      />

      <Alert
        type="warning"
        showIcon
        icon={<LockOutlined />}
        message="Encrypted at rest"
        description="When a client submits, TFN/ABN/ACN, BSB, account number, and date of birth are encrypted server-side with AES-256-GCM. After submission, only the last 4 digits and year of birth are ever exposed to admin staff."
        style={{ marginBottom: 16 }}
      />

      <Card>
        <Form layout="vertical" disabled autoComplete="off">
          {/* ─── Section 1: Personal Details ─────────────────── */}
          <Title level={4}>1. Personal Details</Title>
          <Form.Item label="First name" required>
            <Input placeholder="Jane" />
          </Form.Item>
          <Form.Item label="Last name" required>
            <Input placeholder="Doe" />
          </Form.Item>
          <Form.Item label="Email" required>
            <Input placeholder="jane@example.com" />
          </Form.Item>
          <Form.Item label="Phone" required help="Exactly 10 digits">
            <Input placeholder="0412345678" />
          </Form.Item>
          <Form.Item
            label="Date of birth"
            required
            extra="Encrypted at rest. Only the year is displayed after submission."
          >
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="Gender" required>
            <Radio.Group>
              <Radio value="male">Male</Radio>
              <Radio value="female">Female</Radio>
            </Radio.Group>
          </Form.Item>

          <Divider />

          {/* ─── Section 2: Address ──────────────────────────── */}
          <Title level={4}>2. Address Details</Title>
          <Form.Item label="House / unit number" required>
            <Input />
          </Form.Item>
          <Form.Item label="Street name" required>
            <Input />
          </Form.Item>
          <Form.Item label="Suburb / city" required>
            <Input />
          </Form.Item>
          <Form.Item label="Post code" required help="4 digits">
            <Input placeholder="2000" />
          </Form.Item>
          <Form.Item label="State" required>
            <Select
              placeholder="Select state"
              options={AU_STATES.map((s) => ({ label: s, value: s }))}
            />
          </Form.Item>

          <Divider />

          {/* ─── Section 3: Tax & Banking ────────────────────── */}
          <Title level={4}>3. Tax &amp; Banking Details</Title>
          <Alert
            type="warning"
            showIcon
            icon={<LockOutlined />}
            message="Encrypted fields"
            description="The 4 fields below are sent over HTTPS and encrypted on the server with AES-256-GCM before storage. Only the last 4 digits are retrievable afterwards."
            style={{ marginBottom: 16 }}
          />
          <Form.Item label="Work type" required>
            <Select
              placeholder="TFN / ABN / ACN"
              options={WORK_TYPES.map((w) => ({ label: w, value: w }))}
            />
          </Form.Item>
          <Form.Item
            label="TFN / ABN / ACN number"
            required
            extra="TFN/ACN = 9 digits, ABN = 11 digits"
          >
            <Input.Password placeholder="9 or 11 digit number" visibilityToggle />
          </Form.Item>
          <Form.Item label="BSB" required help="Exactly 6 digits">
            <Input placeholder="062123" />
          </Form.Item>
          <Form.Item label="Account number" required help="4-10 digits">
            <Input.Password visibilityToggle />
          </Form.Item>
          <Form.Item label="Account name" required>
            <Input />
          </Form.Item>

          <Divider />

          {/* ─── Section 4: Primary ID ───────────────────────── */}
          <Title level={4}>4. Primary ID</Title>
          <Paragraph type="secondary">
            Accepted documents: Australian full birth certificate, Australian
            passport, Australian citizenship certificate, Register of
            Citizenship by Descent extract, foreign passport, or driver&apos;s
            licence.
          </Paragraph>
          <Form.Item label="Document type" required>
            <Select
              placeholder="Select document type"
              options={PRIMARY_ID_TYPES.map((v) => ({
                label: PRIMARY_ID_LABELS[v],
                value: v,
              }))}
            />
          </Form.Item>
          <Form.Item
            label="Document URL"
            required
            extra="Client uploads via Document Vault first, then pastes the URL here."
          >
            <Input placeholder="https://..." />
          </Form.Item>

          <Divider />

          {/* ─── Section 5: Secondary ID ─────────────────────── */}
          <Title level={4}>5. Secondary ID</Title>
          <Paragraph type="secondary">
            Accepted documents: National photo ID, foreign government ID,
            marriage certificate, driver&apos;s licence, or current bank
            statement / card.
          </Paragraph>
          <Form.Item label="Document type" required>
            <Select
              placeholder="Select document type"
              options={SECONDARY_ID_TYPES.map((v) => ({
                label: SECONDARY_ID_LABELS[v],
                value: v,
              }))}
            />
          </Form.Item>
          <Form.Item label="Document URL" required>
            <Input placeholder="https://..." />
          </Form.Item>

          <Divider />

          {/* ─── Section 6: Consent ──────────────────────────── */}
          <Title level={4}>6. Consent Agreement</Title>
          <Form.Item required>
            <Checkbox>
              I agree to share my financial information with{' '}
              <strong>Quintessential Accounting &amp; Taxation</strong>. I
              authorise Jasmine Kaur and Quintessential Accounting &amp;
              Taxation to access my ATO account, file returns, and act on my
              behalf.
            </Checkbox>
          </Form.Item>

          {/* Disabled submit — preview only */}
          <Space style={{ marginTop: 16 }}>
            <Button type="primary" disabled>
              Submit form
            </Button>
            <Text type="secondary" style={{ fontSize: 12 }}>
              (disabled — preview only)
            </Text>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
