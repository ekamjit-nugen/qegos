'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  Row,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  ForkOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  SaveOutlined,
  StarFilled,
} from '@ant-design/icons';
import {
  useDeleteDraft,
  useDisableVersion,
  useEnableVersion,
  useForkVersion,
  useFormMapping,
  useFormMappingVersion,
  usePublishVersion,
  useSetDefaultVersion,
  useUpdateDraft,
  useValidateSchema,
} from '@/hooks/useFormMappings';
import type { FormMappingSchema, ValidateSchemaResult } from '@/types/formMapping';
import { JsonEditor } from './JsonEditor';
import { PreviewPane } from './PreviewPane';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface Props {
  mappingId: string;
  version: number;
}

function extractErr(e: unknown): string {
  const err = e as {
    response?: { data?: { message?: string; code?: string; errors?: Array<{ message: string }> } };
    message?: string;
  };
  const base = err.response?.data?.message ?? err.message ?? 'Request failed';
  const details = err.response?.data?.errors?.map((x) => x.message).join('; ');
  return details ? `${base}: ${details}` : base;
}

export function FormMappingVersionEditor({ mappingId, version }: Props): React.ReactNode {
  const router = useRouter();
  const { data: mappingDetail } = useFormMapping(mappingId);
  const { data: versionDoc, isLoading } = useFormMappingVersion(mappingId, version);

  const [jsonText, setJsonText] = useState('');
  const [notes, setNotes] = useState('');
  const [parsed, setParsed] = useState<FormMappingSchema | null>(null);
  const [jsonParseError, setJsonParseError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidateSchemaResult | null>(null);
  const [dirty, setDirty] = useState(false);

  const validateMut = useValidateSchema();
  const updateDraft = useUpdateDraft(mappingId);
  const publish = usePublishVersion(mappingId);
  const fork = useForkVersion(mappingId);
  const disable = useDisableVersion(mappingId);
  const enable = useEnableVersion(mappingId);
  const setDefault = useSetDefaultVersion(mappingId);
  const deleteDraft = useDeleteDraft(mappingId);

  const isDraft = versionDoc?.status === 'draft';
  const isPublished = versionDoc?.status === 'published';
  const isActive = versionDoc?.lifecycleStatus === 'active';
  const isDisabled = versionDoc?.lifecycleStatus === 'disabled';
  const isDefault = versionDoc?.isDefault ?? false;

  // Hydrate local state when the version loads
  useEffect(() => {
    if (!versionDoc) return;
    setJsonText(JSON.stringify(versionDoc.schema, null, 2));
    setNotes(versionDoc.notes ?? '');
    setParsed(versionDoc.schema);
    setJsonParseError(null);
    setDirty(false);
  }, [versionDoc]);

  // Parse JSON on every edit (cheap, local)
  useEffect(() => {
    if (!jsonText) {
      setParsed(null);
      setJsonParseError(null);
      return;
    }
    try {
      const obj = JSON.parse(jsonText) as FormMappingSchema;
      setParsed(obj);
      setJsonParseError(null);
    } catch (e) {
      setParsed(null);
      setJsonParseError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  }, [jsonText]);

  // Debounced server-side validation whenever parsed schema changes
  useEffect(() => {
    if (!parsed) {
      setValidation(null);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const result = await validateMut.mutateAsync(parsed);
        setValidation(result);
      } catch {
        // server error surface — leave validation alone
      }
    }, 500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed]);

  const schemaIsClean = !!validation && validation.valid && !jsonParseError;

  const onEditorChange = (next: string): void => {
    setJsonText(next);
    setDirty(true);
  };

  const handleSave = async (): Promise<void> => {
    if (!parsed) {
      message.error('Fix JSON parse errors first');
      return;
    }
    if (!isDraft) {
      message.error('Published versions are read-only — fork a new draft instead');
      return;
    }
    try {
      await updateDraft.mutateAsync({ version, input: { schema: parsed, notes } });
      message.success('Draft saved');
      setDirty(false);
    } catch (e) {
      message.error(extractErr(e));
    }
  };

  const handlePublish = async (): Promise<void> => {
    if (dirty) {
      message.warning('Save before publishing');
      return;
    }
    try {
      await publish.mutateAsync(version);
      message.success(`Published v${version}`);
    } catch (e) {
      message.error(extractErr(e));
    }
  };

  const handleFork = async (): Promise<void> => {
    try {
      const v = await fork.mutateAsync({ sourceVersion: version });
      message.success(`Created draft v${v.version}`);
      router.push(`/form-mappings/${mappingId}/versions/${v.version}`);
    } catch (e) {
      message.error(extractErr(e));
    }
  };

  const handleDisable = async (): Promise<void> => {
    try {
      await disable.mutateAsync(version);
      message.success('Disabled');
    } catch (e) {
      message.error(extractErr(e));
    }
  };

  const handleEnable = async (): Promise<void> => {
    try {
      await enable.mutateAsync(version);
      message.success('Enabled');
    } catch (e) {
      message.error(extractErr(e));
    }
  };

  const handleSetDefault = async (): Promise<void> => {
    try {
      await setDefault.mutateAsync(version);
      message.success('Set as default');
    } catch (e) {
      message.error(extractErr(e));
    }
  };

  const handleDelete = async (): Promise<void> => {
    try {
      await deleteDraft.mutateAsync(version);
      message.success('Draft deleted');
      router.push(`/form-mappings/${mappingId}`);
    } catch (e) {
      message.error(extractErr(e));
    }
  };

  const lifecycleBanner = useMemo(() => {
    if (!versionDoc) return null;
    if (isDraft) {
      return (
        <Alert
          type="warning"
          showIcon
          message={`Draft v${version} — editable`}
          description="Changes are saved as draft. Publish to produce an immutable version."
          style={{ marginBottom: 12 }}
        />
      );
    }
    if (isPublished) {
      return (
        <Alert
          type="info"
          showIcon
          message={`Published v${version} — read-only`}
          description="To change this schema, fork a new draft from this version."
          style={{ marginBottom: 12 }}
        />
      );
    }
    return null;
  }, [versionDoc, isDraft, isPublished, version]);

  if (isLoading || !versionDoc) return <Card loading />;

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push(`/form-mappings/${mappingId}`)}
        >
          Back
        </Button>
        <Title level={3} style={{ margin: 0 }}>
          {mappingDetail?.mapping.title} — v{version}
        </Title>
        <Space>
          {isDraft && <Tag color="gold">draft</Tag>}
          {isPublished && <Tag color="blue">published</Tag>}
          {isActive && <Tag color="green">active</Tag>}
          {isDisabled && <Tag color="red">disabled</Tag>}
          {isDefault && (
            <Tag color="purple" icon={<StarFilled />}>
              default
            </Tag>
          )}
        </Space>
      </div>

      {lifecycleBanner}

      {/* Action bar */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          {isDraft && (
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              disabled={!!jsonParseError || !dirty}
              loading={updateDraft.isPending}
            >
              Save Draft
            </Button>
          )}
          {isDraft && (
            <Tooltip
              title={
                !schemaIsClean
                  ? 'Schema must validate clean before you can publish'
                  : dirty
                    ? 'Save before publishing'
                    : ''
              }
            >
              <Button
                icon={<CheckCircleOutlined />}
                onClick={handlePublish}
                disabled={!schemaIsClean || dirty}
                loading={publish.isPending}
              >
                Publish
              </Button>
            </Tooltip>
          )}
          {isPublished && (
            <Button icon={<ForkOutlined />} onClick={handleFork} loading={fork.isPending}>
              Fork New Draft
            </Button>
          )}
          {isPublished && isActive && !isDefault && (
            <Button icon={<StarFilled />} onClick={handleSetDefault} loading={setDefault.isPending}>
              Set as Default
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
                danger
                icon={<PauseCircleOutlined />}
                disabled={isDefault}
                onClick={handleDisable}
                loading={disable.isPending}
              >
                Disable
              </Button>
            </Tooltip>
          )}
          {isPublished && isDisabled && (
            <Button icon={<PlayCircleOutlined />} onClick={handleEnable} loading={enable.isPending}>
              Enable
            </Button>
          )}
          {isDraft && (
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleDelete}
              loading={deleteDraft.isPending}
            >
              Delete Draft
            </Button>
          )}
        </Space>
      </Card>

      {/* Validation summary */}
      {jsonParseError && (
        <Alert
          type="error"
          showIcon
          message="Invalid JSON"
          description={jsonParseError}
          style={{ marginBottom: 12 }}
        />
      )}
      {validation && !validation.valid && (
        <Alert
          type="error"
          showIcon
          message={`${validation.issues.length} schema issue${validation.issues.length === 1 ? '' : 's'}`}
          description={
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {validation.issues.slice(0, 20).map((issue, i) => (
                <li key={i}>
                  <Text code>{issue.path || '(root)'}</Text> <Tag>{issue.code}</Tag> {issue.message}
                </li>
              ))}
              {validation.issues.length > 20 && <li>…and {validation.issues.length - 20} more</li>}
            </ul>
          }
          style={{ marginBottom: 12 }}
        />
      )}
      {validation && validation.valid && (
        <Alert
          type="success"
          showIcon
          message={`Schema valid — ${validation.steps.length} steps, ${validation.fieldKeys.length} fields`}
          style={{ marginBottom: 12 }}
        />
      )}

      <Row gutter={12}>
        <Col xs={24} lg={14}>
          <Card
            size="small"
            title="Schema (JSON Schema draft-07 + x-qegos)"
            styles={{ body: { padding: 0 } }}
          >
            <JsonEditor
              value={jsonText}
              onChange={onEditorChange}
              readOnly={!isDraft}
              height={600}
            />
          </Card>
          {isDraft && (
            <Card size="small" title="Version notes" style={{ marginTop: 12 }}>
              <TextArea
                rows={2}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setDirty(true);
                }}
                placeholder="Optional changelog for this draft"
              />
            </Card>
          )}
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" title="Preview">
            <PreviewPane schema={parsed} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
