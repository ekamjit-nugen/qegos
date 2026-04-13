'use client';

import { useCallback, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Empty,
  Input,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  CloudUploadOutlined,
  DownloadOutlined,
  InboxOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UploadProps } from 'antd';
import {
  useClientVaultDocuments,
  useClientStorageUsage,
  useUploadOnBehalf,
  useDownloadVaultDocument,
} from '@/hooks/useVault';
import { useUserList } from '@/hooks/useUsers';
import type { VaultDocument, VaultDocumentListQuery } from '@/types/document';
import { VAULT_CATEGORIES, VAULT_CATEGORY_LABELS } from '@/types/document';
import { formatDate } from '@/lib/utils/format';
import type { User } from '@/types/user';
import { fullName } from '@/lib/utils/format';

const { Title, Text } = Typography;
const { Dragger } = Upload;

const CATEGORY_FILTER_OPTIONS = [
  { label: 'All Categories', value: '' },
  ...VAULT_CATEGORIES.map((c) => ({ label: c.label, value: c.value })),
];

function getFinancialYearOptions(): { value: string; label: string }[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const years: { value: string; label: string }[] = [];
  for (let i = 0; i < 5; i++) {
    const startYear = currentYear - i;
    const endYearShort = String(startYear + 1).slice(-2);
    const fy = `${startYear}-${endYearShort}`;
    years.push({ value: fy, label: fy });
  }
  return years;
}

const FY_FILTER_OPTIONS = [
  { label: 'All Years', value: '' },
  ...getFinancialYearOptions(),
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VaultManagementPage(): React.ReactNode {
  // ─── Client search state ──────────────────────────────────────────────
  const [clientSearch, setClientSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // ─── Document filters ─────────────────────────────────────────────────
  const [filters, setFilters] = useState<VaultDocumentListQuery>({
    page: 1,
    limit: 20,
  });

  // ─── Upload modal state ───────────────────────────────────────────────
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadYear, setUploadYear] = useState<string | undefined>();
  const [uploadCategory, setUploadCategory] = useState<string | undefined>();

  // ─── Data hooks ───────────────────────────────────────────────────────
  const { data: usersResponse, isLoading: usersLoading } = useUserList({
    search: clientSearch,
    limit: 20,
    userType: 7, // ClientPortal users
  });

  const { data: docsResponse, isLoading: docsLoading } = useClientVaultDocuments(
    selectedUser?._id,
    filters,
  );

  const { data: storage } = useClientStorageUsage(selectedUser?._id);
  const uploadMutation = useUploadOnBehalf();
  const downloadMutation = useDownloadVaultDocument();

  const documents = docsResponse?.data ?? [];
  const meta = docsResponse?.meta;

  // ─── Handlers ─────────────────────────────────────────────────────────
  const handleSelectClient = useCallback((user: User) => {
    setSelectedUser(user);
    setFilters({ page: 1, limit: 20 });
  }, []);

  const handleUpload: UploadProps['customRequest'] = useCallback(
    (options: { file: unknown; onSuccess?: (body: unknown) => void; onError?: (err: Error) => void }) => {
      if (!selectedUser || !uploadYear || !uploadCategory) {
        void message.warning('Please select financial year and category');
        return;
      }
      const formData = new FormData();
      formData.append('file', options.file as File);
      formData.append('financialYear', uploadYear);
      formData.append('category', uploadCategory);
      uploadMutation.mutate(
        { userId: selectedUser._id, formData },
        {
          onSuccess: () => {
            void message.success('Document uploaded on behalf of client');
            options.onSuccess?.({});
            setUploadOpen(false);
            setUploadYear(undefined);
            setUploadCategory(undefined);
          },
          onError: () => {
            void message.error('Upload failed. Check file type and size.');
            options.onError?.(new Error('Upload failed'));
          },
        },
      );
    },
    [selectedUser, uploadYear, uploadCategory, uploadMutation],
  );

  const handleDownload = useCallback(
    (docId: string) => {
      if (!selectedUser) { return; }
      downloadMutation.mutate(
        { userId: selectedUser._id, docId },
        {
          onSuccess: (result) => {
            const url = result.downloadUrl;
            if (url) {
              window.open(url, '_blank');
            } else {
              void message.error('Download URL not available');
            }
          },
          onError: () => {
            void message.error('Failed to get download link');
          },
        },
      );
    },
    [selectedUser, downloadMutation],
  );

  // ─── Table columns ───────────────────────────────────────────────────
  const columns: ColumnsType<VaultDocument> = [
    {
      title: 'File Name',
      dataIndex: 'fileName',
      ellipsis: true,
    },
    {
      title: 'Category',
      dataIndex: 'category',
      width: 180,
      render: (v: string) => <Tag>{VAULT_CATEGORY_LABELS[v] ?? v}</Tag>,
    },
    {
      title: 'Financial Year',
      dataIndex: 'financialYear',
      width: 120,
    },
    {
      title: 'Size',
      dataIndex: 'fileSize',
      width: 100,
      render: (v: number) => formatFileSize(v),
    },
    {
      title: 'Uploaded By',
      dataIndex: 'uploadedBy',
      width: 100,
      render: (v: string) => (
        <Tag color={v === 'staff' ? 'blue' : v === 'system' ? 'purple' : 'green'}>{v}</Tag>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 100,
      render: (_: unknown, record: VaultDocument) =>
        record.isArchived ? <Tag color="orange">Archived</Tag> : <Tag color="green">Active</Tag>,
    },
    {
      title: 'Uploaded',
      dataIndex: 'createdAt',
      width: 120,
      render: (v: string) => formatDate(v),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: VaultDocument) => (
        <Button
          type="link"
          icon={<DownloadOutlined />}
          size="small"
          loading={downloadMutation.isPending}
          onClick={() => { handleDownload(record._id); }}
        >
          Download
        </Button>
      ),
    },
  ];

  // ─── Client search results ───────────────────────────────────────────
  const clientResults = usersResponse?.data ?? [];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        Client Vault Management
      </Title>

      {/* Client Selector */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col xs={24} sm={12} lg={8}>
            <Input
              placeholder="Search client by name or email…"
              prefix={<SearchOutlined />}
              value={clientSearch}
              onChange={(e) => { setClientSearch(e.target.value); }}
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} lg={16}>
            {selectedUser && (
              <Space>
                <UserOutlined />
                <Text strong>
                  {fullName(selectedUser.firstName, selectedUser.lastName)}
                </Text>
                <Text type="secondary">{selectedUser.email}</Text>
                <Button
                  type="link"
                  size="small"
                  onClick={() => { setSelectedUser(null); }}
                >
                  Change
                </Button>
              </Space>
            )}
          </Col>
        </Row>

        {/* Client search results list */}
        {clientSearch && !selectedUser && (
          <div style={{ marginTop: 12 }}>
            {usersLoading ? (
              <Spin size="small" />
            ) : clientResults.length === 0 ? (
              <Text type="secondary">No clients found</Text>
            ) : (
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {clientResults.map((user) => (
                  <div
                    key={user._id}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f0f0f0',
                    }}
                    onClick={() => { handleSelectClient(user); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { handleSelectClient(user); } }}
                    role="button"
                    tabIndex={0}
                  >
                    <Text strong>{fullName(user.firstName, user.lastName)}</Text>
                    <Text type="secondary" style={{ marginLeft: 12 }}>{user.email}</Text>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Rest of page only shows when a client is selected */}
      {!selectedUser ? (
        <Empty description="Select a client to view their vault" />
      ) : (
        <>
          {/* Storage usage */}
          {storage && (
            <Card size="small" style={{ marginBottom: 16 }}>
              <Text type="secondary">
                Storage Usage — {fullName(selectedUser.firstName, selectedUser.lastName)}
              </Text>
              <Progress
                percent={Math.round((storage.used / storage.quota) * 100)}
                format={() =>
                  `${formatFileSize(storage.used)} / ${formatFileSize(storage.quota)}`
                }
                style={{ marginTop: 4 }}
              />
              {storage.breakdown && storage.breakdown.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Breakdown:{' '}
                    {storage.breakdown
                      .map(
                        (b) =>
                          `${b.financialYear}: ${b.count} files (${formatFileSize(b.totalSize)})`,
                      )
                      .join(' · ')}
                  </Text>
                </div>
              )}
            </Card>
          )}

          {/* Filters + Upload */}
          <Space wrap style={{ marginBottom: 16 }}>
            <Select
              value={filters.financialYear ?? ''}
              onChange={(v) => { setFilters((f) => ({ ...f, financialYear: v || undefined, page: 1 })); }}
              options={FY_FILTER_OPTIONS}
              style={{ width: 160 }}
              placeholder="Financial Year"
            />
            <Select
              value={filters.category ?? ''}
              onChange={(v) => { setFilters((f) => ({ ...f, category: v || undefined, page: 1 })); }}
              options={CATEGORY_FILTER_OPTIONS}
              style={{ width: 220 }}
              placeholder="Category"
            />
            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              onClick={() => { setUploadOpen(true); }}
            >
              Upload on Behalf
            </Button>
          </Space>

          {/* Upload Modal */}
          <Modal
            title={`Upload Document — ${fullName(selectedUser.firstName, selectedUser.lastName)}`}
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
                  options={VAULT_CATEGORIES.map((c) => ({ label: c.label, value: c.value }))}
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

          {/* Documents Table */}
          <Table<VaultDocument>
            columns={columns}
            dataSource={documents}
            rowKey="_id"
            loading={docsLoading}
            size="small"
            pagination={{
              current: meta?.page ?? 1,
              pageSize: meta?.limit ?? 20,
              total: meta?.total ?? 0,
              showTotal: (total) => `${total} documents`,
              onChange: (page, pageSize) => {
                setFilters((f) => ({ ...f, page, limit: pageSize }));
              },
            }}
            locale={{ emptyText: <Empty description="No vault documents found" /> }}
          />
        </>
      )}
    </div>
  );
}
