'use client';

import { useCallback, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Empty,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  CloudUploadOutlined,
  DownloadOutlined,
  InboxOutlined,
  FolderOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import {
  useVaultDocuments,
  useVaultYears,
  useStorageUsage,
  useUploadDocument,
  useArchiveDocument,
  useRestoreDocument,
} from '@/hooks/usePortal';
import { api } from '@/lib/api/client';
import type { VaultDocument } from '@/types/vault';
import type { ApiResponse } from '@/types/api';
import { formatDate } from '@/lib/utils/format';

const { Title, Text } = Typography;
const { Dragger } = Upload;

// ─── Document categories matching backend VAULT_DOCUMENT_CATEGORIES ─────
const VAULT_CATEGORIES = [
  { value: 'payg_summary', label: 'PAYG Summary' },
  { value: 'interest_statement', label: 'Interest Statement' },
  { value: 'dividend_statement', label: 'Dividend Statement' },
  { value: 'managed_fund_statement', label: 'Managed Fund Statement' },
  { value: 'rental_income', label: 'Rental Income' },
  { value: 'self_employment', label: 'Self Employment' },
  { value: 'private_health_insurance', label: 'Private Health Insurance' },
  { value: 'donation_receipt', label: 'Donation Receipt' },
  { value: 'work_expense_receipt', label: 'Work Expense Receipt' },
  { value: 'self_education', label: 'Self Education' },
  { value: 'vehicle_logbook', label: 'Vehicle Logbook' },
  { value: 'home_office', label: 'Home Office' },
  { value: 'notice_of_assessment', label: 'Notice of Assessment' },
  { value: 'tax_return_copy', label: 'Tax Return Copy' },
  { value: 'bas_statement', label: 'BAS Statement' },
  { value: 'id_document', label: 'ID Document' },
  { value: 'superannuation_statement', label: 'Superannuation Statement' },
  { value: 'foreign_income', label: 'Foreign Income' },
  { value: 'capital_gains_record', label: 'Capital Gains Record' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_FILTER_OPTIONS = [{ label: 'All Categories', value: '' }, ...VAULT_CATEGORIES];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  VAULT_CATEGORIES.map((c) => [c.value, c.label]),
);

// Financial year options for upload form
function getFinancialYearOptions(): { value: string; label: string }[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const years: { value: string; label: string }[] = [];
  // Show current FY + 4 prior years
  for (let i = 0; i < 5; i++) {
    const startYear = currentYear - i;
    const endYearShort = String(startYear + 1).slice(-2);
    const fy = `${startYear}-${endYearShort}`;
    years.push({ value: fy, label: fy });
  }
  return years;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VaultPage(): React.ReactNode {
  const [financialYear, setFinancialYear] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadYear, setUploadYear] = useState<string | undefined>();
  const [uploadCategory, setUploadCategory] = useState<string | undefined>();

  const { data: docsResponse, isLoading: docsLoading } = useVaultDocuments({
    financialYear: financialYear || undefined,
    category: category || undefined,
  });
  const { data: years } = useVaultYears();
  const { data: storage } = useStorageUsage();
  const uploadMutation = useUploadDocument();
  const archiveMutation = useArchiveDocument();
  const restoreMutation = useRestoreDocument();

  const documents = docsResponse?.data ?? [];

  const handleUpload: UploadProps['customRequest'] = useCallback(
    (options: {
      file: unknown;
      onSuccess?: (body: unknown) => void;
      onError?: (err: Error) => void;
    }) => {
      if (!uploadYear || !uploadCategory) {
        void message.warning('Please select a financial year and category first');
        return;
      }
      const formData = new FormData();
      formData.append('file', options.file as File);
      formData.append('financialYear', uploadYear);
      formData.append('category', uploadCategory);
      uploadMutation.mutate(formData, {
        onSuccess: () => {
          void message.success('Document uploaded successfully');
          options.onSuccess?.({});
          setUploadOpen(false);
          setUploadYear(undefined);
          setUploadCategory(undefined);
        },
        onError: () => {
          void message.error('Upload failed. Check file type and size.');
          options.onError?.(new Error('Upload failed'));
        },
      });
    },
    [uploadYear, uploadCategory, uploadMutation],
  );

  const handleArchive = useCallback(
    (id: string) => {
      archiveMutation.mutate(id, {
        onSuccess: () => {
          void message.success('Document archived');
        },
      });
    },
    [archiveMutation],
  );

  const handleRestore = useCallback(
    (id: string) => {
      restoreMutation.mutate(id, {
        onSuccess: () => {
          void message.success('Document restored');
        },
      });
    },
    [restoreMutation],
  );

  const handleDownload = useCallback(async (id: string) => {
    try {
      const res = await api.get<ApiResponse<{ document: VaultDocument; downloadUrl: string }>>(
        `/portal/vault/documents/${id}`,
      );
      const url = res.data.data.downloadUrl;
      if (url) {
        window.open(url, '_blank');
      } else {
        void message.error('Download URL not available');
      }
    } catch {
      void message.error('Failed to get download link');
    }
  }, []);

  const yearOptions = [
    { label: 'All Years', value: '' },
    ...(years ?? []).map((y) => ({ label: y.year, value: y.year })),
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        Document Vault
      </Title>

      {storage && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Text type="secondary">Storage Usage</Text>
          <Progress
            percent={storage.percentage}
            format={() => `${formatFileSize(storage.used)} / ${formatFileSize(storage.limit)}`}
            style={{ marginTop: 4 }}
          />
        </Card>
      )}

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          value={financialYear}
          onChange={setFinancialYear}
          options={yearOptions}
          style={{ width: 160 }}
          placeholder="Financial Year"
        />
        <Select
          value={category}
          onChange={setCategory}
          options={CATEGORY_FILTER_OPTIONS}
          style={{ width: 220 }}
          placeholder="Category"
        />
        <Button
          type="primary"
          icon={<CloudUploadOutlined />}
          onClick={() => {
            setUploadOpen(true);
          }}
        >
          Upload Document
        </Button>
      </Space>

      <Modal
        title="Upload Document"
        open={uploadOpen}
        onCancel={() => {
          setUploadOpen(false);
          setUploadYear(undefined);
          setUploadCategory(undefined);
        }}
        footer={null}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }} size="middle">
          <div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>
              Financial Year *
            </Text>
            <Select
              value={uploadYear}
              onChange={setUploadYear}
              options={getFinancialYearOptions()}
              style={{ width: '100%' }}
              placeholder="Select financial year"
            />
          </div>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>
              Category *
            </Text>
            <Select
              value={uploadCategory}
              onChange={setUploadCategory}
              options={VAULT_CATEGORIES}
              style={{ width: '100%' }}
              placeholder="Select document category"
              showSearch
              optionFilterProp="label"
            />
          </div>
        </Space>
        <Dragger
          customRequest={handleUpload as UploadProps['customRequest']}
          showUploadList={false}
          accept=".pdf,.jpg,.jpeg,.png,.heic,.tif,.tiff"
          disabled={!uploadYear || !uploadCategory}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Click or drag a file to upload</p>
          <p className="ant-upload-hint">PDF or image files up to 20 MB</p>
        </Dragger>
      </Modal>

      {docsLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : documents.length === 0 ? (
        <Empty description="No documents found" />
      ) : (
        <Row gutter={[16, 16]}>
          {documents.map((doc: VaultDocument) => (
            <Col xs={24} sm={12} lg={8} key={doc._id}>
              <Card
                size="small"
                actions={[
                  <Button
                    key="download"
                    type="link"
                    icon={<DownloadOutlined />}
                    size="small"
                    onClick={() => {
                      void handleDownload(doc._id);
                    }}
                  >
                    Download
                  </Button>,
                  doc.isArchived ? (
                    <Button
                      key="restore"
                      type="link"
                      icon={<UndoOutlined />}
                      size="small"
                      onClick={() => {
                        handleRestore(doc._id);
                      }}
                    >
                      Restore
                    </Button>
                  ) : (
                    <Popconfirm
                      key="archive"
                      title="Archive this document?"
                      description="Archived documents are permanently deleted after 30 days."
                      onConfirm={() => {
                        handleArchive(doc._id);
                      }}
                      okText="Archive"
                      cancelText="Cancel"
                    >
                      <Button type="link" icon={<FolderOutlined />} size="small">
                        Archive
                      </Button>
                    </Popconfirm>
                  ),
                ]}
              >
                <Text strong ellipsis style={{ display: 'block', marginBottom: 4 }}>
                  {doc.fileName}
                </Text>
                <Space size={4} wrap>
                  <Tag>{CATEGORY_LABELS[doc.category] ?? doc.category}</Tag>
                  {doc.isArchived && <Tag color="orange">Archived</Tag>}
                </Space>
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatFileSize(doc.fileSize)} &middot; {doc.uploadedBy} &middot;{' '}
                    {formatDate(doc.createdAt)}
                  </Text>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
