'use client';

import { useCallback, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Empty,
  Modal,
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
  DeleteOutlined,
  DownloadOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import {
  useVaultDocuments,
  useVaultYears,
  useStorageUsage,
  useUploadDocument,
  useDeleteDocument,
  useArchiveDocument,
} from '@/hooks/usePortal';
import type { VaultDocument } from '@/types/vault';
import { formatDate } from '@/lib/utils/format';

const { Title, Text } = Typography;
const { Dragger } = Upload;

const CATEGORY_OPTIONS = [
  { label: 'All Categories', value: '' },
  { label: 'Tax Return', value: 'tax_return' },
  { label: 'Payment Summary', value: 'payment_summary' },
  { label: 'Receipt', value: 'receipt' },
  { label: 'Invoice', value: 'invoice' },
  { label: 'Identity', value: 'identity' },
  { label: 'Other', value: 'other' },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VaultPage(): React.ReactNode {
  const [financialYear, setFinancialYear] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: docsResponse, isLoading: docsLoading } = useVaultDocuments({
    financialYear: financialYear || undefined,
    category: category || undefined,
  });
  const { data: years } = useVaultYears();
  const { data: storage } = useStorageUsage();
  const uploadMutation = useUploadDocument();
  const deleteMutation = useDeleteDocument();
  const archiveMutation = useArchiveDocument();

  const documents = docsResponse?.data ?? [];

  const handleUpload: UploadProps['customRequest'] = useCallback(
    (options: { file: unknown; onSuccess?: (body: unknown) => void; onError?: (err: Error) => void }) => {
      const formData = new FormData();
      formData.append('file', options.file as File);
      if (financialYear) {
        formData.append('financialYear', financialYear);
      }
      uploadMutation.mutate(formData, {
        onSuccess: () => {
          void message.success('Document uploaded successfully');
          options.onSuccess?.({});
          setUploadOpen(false);
        },
        onError: () => {
          void message.error('Upload failed');
          options.onError?.(new Error('Upload failed'));
        },
      });
    },
    [financialYear, uploadMutation],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteMutation.mutate(id, {
        onSuccess: () => {
          void message.success('Document deleted');
        },
      });
    },
    [deleteMutation],
  );

  const handleArchiveToggle = useCallback(
    (id: string, isArchived: boolean) => {
      archiveMutation.mutate(
        { id, archive: !isArchived },
        {
          onSuccess: () => {
            void message.success(isArchived ? 'Document restored' : 'Document archived');
          },
        },
      );
    },
    [archiveMutation],
  );

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
            format={() =>
              `${formatFileSize(storage.used)} / ${formatFileSize(storage.limit)}`
            }
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
          options={CATEGORY_OPTIONS}
          style={{ width: 180 }}
          placeholder="Category"
        />
        <Button
          type="primary"
          icon={<CloudUploadOutlined />}
          onClick={() => { setUploadOpen(true); }}
        >
          Upload Document
        </Button>
      </Space>

      <Modal
        title="Upload Document"
        open={uploadOpen}
        onCancel={() => { setUploadOpen(false); }}
        footer={null}
      >
        <Dragger
          customRequest={handleUpload as UploadProps['customRequest']}
          showUploadList={false}
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Click or drag a file to upload</p>
          <p className="ant-upload-hint">
            PDF, images, or Office documents up to 10 MB
          </p>
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
                  >
                    Download
                  </Button>,
                  <Button
                    key="archive"
                    type="link"
                    size="small"
                    onClick={() => { handleArchiveToggle(doc._id, doc.isArchived); }}
                  >
                    {doc.isArchived ? 'Restore' : 'Archive'}
                  </Button>,
                  <Button
                    key="delete"
                    type="link"
                    danger
                    icon={<DeleteOutlined />}
                    size="small"
                    onClick={() => { handleDelete(doc._id); }}
                  />,
                ]}
              >
                <Text strong ellipsis style={{ display: 'block', marginBottom: 4 }}>
                  {doc.fileName}
                </Text>
                <Space size={4} wrap>
                  <Tag>{doc.category}</Tag>
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
