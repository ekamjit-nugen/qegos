'use client';

import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  Descriptions,
  Modal,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ForkOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  StarFilled,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useSalesList } from '@/hooks/useSales';
import {
  useDeleteDraft,
  useDisableVersion,
  useEnableVersion,
  useForkVersion,
  useFormMapping,
  usePublishVersion,
  useSetDefaultVersion,
} from '@/hooks/useFormMappings';
import type { FormMappingVersion } from '@/types/formMapping';

const { Title, Text } = Typography;

function formatDateTime(val: string | null | undefined): string {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleString();
  } catch {
    return '—';
  }
}

function extractErr(e: unknown): string {
  const err = e as { response?: { data?: { message?: string; code?: string } }; message?: string };
  return err.response?.data?.message ?? err.message ?? 'Request failed';
}

export function FormMappingDetailPage({ mappingId }: { mappingId: string }): React.ReactNode {
  const router = useRouter();
  const { data, isLoading } = useFormMapping(mappingId);
  const { data: salesItems } = useSalesList();

  const fork = useForkVersion(mappingId);
  const publish = usePublishVersion(mappingId);
  const disable = useDisableVersion(mappingId);
  const enable = useEnableVersion(mappingId);
  const setDefault = useSetDefaultVersion(mappingId);
  const deleteDraft = useDeleteDraft(mappingId);

  if (isLoading) return <Card loading />;
  if (!data) return <Text type="danger">Mapping not found</Text>;

  const { mapping, versions } = data;
  const salesTitle = salesItems?.find((s) => s._id === mapping.salesItemId)?.title ?? '—';

  const onFork = (sourceVersion: number): void => {
    Modal.confirm({
      title: `Fork v${sourceVersion} → new draft?`,
      content: 'Creates a new draft with the same schema. Only one draft can exist at a time.',
      onOk: async () => {
        try {
          const v = await fork.mutateAsync({ sourceVersion });
          message.success(`Created draft v${v.version}`);
          router.push(`/form-mappings/${mappingId}/versions/${v.version}`);
        } catch (e) {
          message.error(extractErr(e));
        }
      },
    });
  };

  const onPublish = (version: number): void => {
    Modal.confirm({
      title: `Publish v${version}?`,
      content: 'Published versions become immutable. You can still disable or set as default later.',
      onOk: async () => {
        try {
          await publish.mutateAsync(version);
          message.success(`Published v${version}`);
        } catch (e) {
          message.error(extractErr(e));
        }
      },
    });
  };

  const onDisable = async (version: number): Promise<void> => {
    try {
      await disable.mutateAsync(version);
      message.success(`Disabled v${version}`);
    } catch (e) {
      message.error(extractErr(e));
    }
  };

  const onEnable = async (version: number): Promise<void> => {
    try {
      await enable.mutateAsync(version);
      message.success(`Enabled v${version}`);
    } catch (e) {
      message.error(extractErr(e));
    }
  };

  const onSetDefault = async (version: number): Promise<void> => {
    try {
      await setDefault.mutateAsync(version);
      message.success(`v${version} is now the default`);
    } catch (e) {
      message.error(extractErr(e));
    }
  };

  const onDelete = (version: number): void => {
    Modal.confirm({
      title: `Delete draft v${version}?`,
      content: 'This cannot be undone. Only drafts can be deleted.',
      okType: 'danger',
      onOk: async () => {
        try {
          await deleteDraft.mutateAsync(version);
          message.success(`Deleted draft v${version}`);
        } catch (e) {
          message.error(extractErr(e));
        }
      },
    });
  };

  const columns: ColumnsType<FormMappingVersion> = [
    {
      title: 'Version',
      dataIndex: 'version',
      width: 90,
      render: (v: number) => <Text strong>v{v}</Text>,
    },
    {
      title: 'Status',
      key: 'status',
      width: 200,
      render: (_: unknown, record) => (
        <Space size={4} wrap>
          {record.status === 'draft' ? (
            <Tag color="gold">draft</Tag>
          ) : (
            <Tag color="blue">published</Tag>
          )}
          {record.lifecycleStatus === 'active' && <Tag color="green">active</Tag>}
          {record.lifecycleStatus === 'disabled' && <Tag color="red">disabled</Tag>}
          {record.isDefault && (
            <Tag color="purple" icon={<StarFilled />}>
              default
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Published',
      dataIndex: 'publishedAt',
      width: 180,
      render: formatDateTime,
    },
    {
      title: 'Updated',
      dataIndex: 'updatedAt',
      width: 180,
      render: formatDateTime,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record) => {
        const isDraft = record.status === 'draft';
        const isPublished = record.status === 'published';
        const isActive = record.lifecycleStatus === 'active';
        const isDisabled = record.lifecycleStatus === 'disabled';
        const isDefault = record.isDefault;

        return (
          <Space wrap>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() =>
                router.push(`/form-mappings/${mappingId}/versions/${record.version}`)
              }
            >
              {isDraft ? 'Edit' : 'View'}
            </Button>
            {isDraft && (
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => onPublish(record.version)}
              >
                Publish
              </Button>
            )}
            {isPublished && (
              <Tooltip title="Creates a new draft copy you can edit">
                <Button
                  size="small"
                  icon={<ForkOutlined />}
                  onClick={() => onFork(record.version)}
                >
                  Fork
                </Button>
              </Tooltip>
            )}
            {isPublished && isActive && !isDefault && (
              <Button
                size="small"
                icon={<StarFilled />}
                onClick={() => onSetDefault(record.version)}
              >
                Set Default
              </Button>
            )}
            {isPublished && isActive && (
              <Tooltip
                title={
                  isDefault
                    ? 'Cannot disable — this is the current default. Set another version as default first.'
                    : ''
                }
              >
                <Button
                  size="small"
                  danger
                  icon={<PauseCircleOutlined />}
                  disabled={isDefault}
                  onClick={() => onDisable(record.version)}
                >
                  Disable
                </Button>
              </Tooltip>
            )}
            {isPublished && isDisabled && (
              <Button
                size="small"
                icon={<PlayCircleOutlined />}
                onClick={() => onEnable(record.version)}
              >
                Enable
              </Button>
            )}
            {isDraft && (
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => onDelete(record.version)}
              >
                Delete
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  const hasDraft = versions.some((v) => v.status === 'draft');
  const highest = versions.reduce((m, v) => Math.max(m, v.version), 0);

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/form-mappings')}>
          Back
        </Button>
        <Title level={3} style={{ margin: 0 }}>
          {mapping.title}
        </Title>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label="Sales Item">{salesTitle}</Descriptions.Item>
          <Descriptions.Item label="Financial Year">{mapping.financialYear}</Descriptions.Item>
          <Descriptions.Item label="Total Versions">{versions.length}</Descriptions.Item>
          {mapping.description && (
            <Descriptions.Item label="Description" span={3}>
              {mapping.description}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card
        title="Versions"
        extra={
          !hasDraft && highest > 0 ? (
            <Button
              type="primary"
              icon={<ForkOutlined />}
              onClick={() => onFork(highest)}
              loading={fork.isPending}
            >
              Fork from v{highest}
            </Button>
          ) : null
        }
      >
        <Table<FormMappingVersion>
          columns={columns}
          dataSource={versions}
          rowKey="_id"
          pagination={false}
        />
      </Card>
    </div>
  );
}
