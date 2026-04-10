'use client';

/**
 * Consent Form — admin detail drawer.
 *
 * Shows a single sanitized submission. Under no circumstance does this
 * component see ciphertext or decrypted secrets — it receives last-4
 * and year-of-birth projections from the server and renders them as
 * masked values.
 */

import { Alert, Descriptions, Drawer, Skeleton, Tag, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useAdminConsentFormDetail } from '@/hooks/useConsentForms';
import {
  PRIMARY_ID_LABELS,
  SECONDARY_ID_LABELS,
  type ConsentFormSubmission,
} from '@/types/consentForm';

const { Text, Link: AntLink } = Typography;

interface ConsentFormDetailDrawerProps {
  id: string | null;
  onClose: () => void;
}

function masked(last4: string | undefined): React.ReactNode {
  if (!last4) return <Text type="secondary">—</Text>;
  return (
    <Text code>
      •••• {last4}
    </Text>
  );
}

function formatDate(val: string | undefined): string {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleString();
  } catch {
    return '—';
  }
}

function renderDoc(
  url: string | undefined,
  label: string,
): React.ReactNode {
  if (!url) return <Text type="secondary">—</Text>;
  return (
    <AntLink href={url} target="_blank" rel="noopener noreferrer">
      {label}
    </AntLink>
  );
}

export function ConsentFormDetailDrawer({
  id,
  onClose,
}: ConsentFormDetailDrawerProps): React.ReactNode {
  const { data, isLoading, isError } = useAdminConsentFormDetail(id);
  const open = !!id;

  return (
    <Drawer
      title="Consent Form Submission"
      placement="right"
      width={720}
      open={open}
      onClose={onClose}
      destroyOnClose
    >
      {isLoading && <Skeleton active paragraph={{ rows: 10 }} />}

      {isError && (
        <Alert
          type="error"
          showIcon
          message="Failed to load submission"
          description="Please close this drawer and try again."
        />
      )}

      {data && <SubmissionView data={data} />}
    </Drawer>
  );
}

function SubmissionView({ data }: { data: ConsentFormSubmission }): React.ReactNode {
  return (
    <>
      <Alert
        type="warning"
        showIcon
        icon={<LockOutlined />}
        message="Sensitive fields are masked"
        description="TFN / ABN / ACN, BSB, account number, and date of birth are encrypted at rest with AES-256-GCM. Only the last 4 digits and year of birth are ever exposed to this UI."
        style={{ marginBottom: 16 }}
      />

      <Descriptions
        title="Identity"
        bordered
        column={1}
        size="small"
        style={{ marginBottom: 16 }}
      >
        <Descriptions.Item label="Reference">{data._id}</Descriptions.Item>
        <Descriptions.Item label="User ID">{data.userId}</Descriptions.Item>
        <Descriptions.Item label="Submitted">{formatDate(data.submittedAt)}</Descriptions.Item>
        <Descriptions.Item label="Name">
          {data.firstName} {data.lastName}
        </Descriptions.Item>
        <Descriptions.Item label="Email">{data.email}</Descriptions.Item>
        <Descriptions.Item label="Phone">{data.phone}</Descriptions.Item>
        <Descriptions.Item label="Gender">
          <Tag>{data.gender}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Year of birth">
          {data.dateOfBirthYear}{' '}
          <Text type="secondary" style={{ fontSize: 12 }}>
            (exact DOB encrypted)
          </Text>
        </Descriptions.Item>
      </Descriptions>

      <Descriptions
        title="Address"
        bordered
        column={1}
        size="small"
        style={{ marginBottom: 16 }}
      >
        <Descriptions.Item label="House / unit">{data.houseNumber}</Descriptions.Item>
        <Descriptions.Item label="Street">{data.streetName}</Descriptions.Item>
        <Descriptions.Item label="Suburb / city">{data.city}</Descriptions.Item>
        <Descriptions.Item label="Post code">{data.postCode}</Descriptions.Item>
        <Descriptions.Item label="State">
          <Tag>{data.state}</Tag>
        </Descriptions.Item>
      </Descriptions>

      <Descriptions
        title="Tax & Banking (masked)"
        bordered
        column={1}
        size="small"
        style={{ marginBottom: 16 }}
      >
        <Descriptions.Item label="Work type">
          <Tag color="blue">{data.workType}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label={`${data.workType} number`}>
          {masked(data.tfnAbnAcnLast4)}
        </Descriptions.Item>
        <Descriptions.Item label="BSB">{masked(data.bsbLast4)}</Descriptions.Item>
        <Descriptions.Item label="Account number">
          {masked(data.accountNumberLast4)}
        </Descriptions.Item>
        <Descriptions.Item label="Account name">{data.accountName}</Descriptions.Item>
      </Descriptions>

      <Descriptions
        title="Identity documents"
        bordered
        column={1}
        size="small"
        style={{ marginBottom: 16 }}
      >
        <Descriptions.Item label="Primary ID type">
          {PRIMARY_ID_LABELS[data.primaryIdType]}
        </Descriptions.Item>
        <Descriptions.Item label="Primary ID">
          {renderDoc(data.primaryIdUrl, 'Open primary ID')}
        </Descriptions.Item>
        <Descriptions.Item label="Secondary ID type">
          {SECONDARY_ID_LABELS[data.secondaryIdType]}
        </Descriptions.Item>
        <Descriptions.Item label="Secondary ID">
          {renderDoc(data.secondaryIdUrl, 'Open secondary ID')}
        </Descriptions.Item>
      </Descriptions>

      <Descriptions title="Consent" bordered column={1} size="small">
        <Descriptions.Item label="Agreement">
          {data.consentAgreement ? (
            <Tag color="green">Signed</Tag>
          ) : (
            <Tag color="red">Not signed</Tag>
          )}
        </Descriptions.Item>
      </Descriptions>
    </>
  );
}
