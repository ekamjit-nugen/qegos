'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Drawer,
  Form,
  Input,
  Select,
  Button,
  Space,
  App,
  Tag,
  Tooltip,
  Divider,
  Card,
  Alert,
} from 'antd';
import { EyeOutlined, TagOutlined } from '@ant-design/icons';
import {
  useCreateTemplate,
  useUpdateTemplate,
  usePreviewMessage,
} from '@/hooks/useBroadcasts';
import {
  CHANNEL_LABELS,
  TEMPLATE_CATEGORY_LABELS,
  MERGE_TAGS,
} from '@/types/broadcast';
import type {
  BroadcastTemplate,
  CreateTemplateInput,
  PreviewResult,
  SingleChannel,
  TemplateCategory,
} from '@/types/broadcast';

interface Props {
  template?: BroadcastTemplate;
  open: boolean;
  onClose: () => void;
}

const SINGLE_CHANNELS: SingleChannel[] = ['sms', 'email', 'whatsapp'];

interface FormValues {
  name: string;
  channel: SingleChannel;
  category: TemplateCategory;
  subject?: string;
  body: string;
}

const SAMPLE_MERGE_DATA: Record<string, string> = MERGE_TAGS.reduce(
  (acc, t) => ({ ...acc, [t.tag]: t.sample }),
  {},
);

export function TemplateEditor({ template, open, onClose }: Props): React.ReactNode {
  const isEdit = !!template;
  const [form] = Form.useForm<FormValues>();
  const channel: SingleChannel = Form.useWatch('channel', form) ?? template?.channel ?? 'sms';
  const body = Form.useWatch('body', form) ?? '';
  const subject = Form.useWatch('subject', form) ?? '';
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const bodyRef = useRef<{ resizableTextArea?: { textArea: HTMLTextAreaElement } } | null>(null);

  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const previewMessage = usePreviewMessage();
  const { message } = App.useApp();

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        name: template?.name ?? '',
        channel: template?.channel ?? 'sms',
        category: template?.category ?? 'announcement',
        subject: template?.subject ?? '',
        body: template?.body ?? '',
      });
      setPreview(null);
    }
  }, [open, template, form]);

  // Debounced auto-preview as user types
  useEffect(() => {
    if (!open || !body) {
      setPreview(null);
      return;
    }
    const handle = setTimeout(() => {
      previewMessage.mutate(
        {
          channel,
          body,
          subject: channel === 'email' ? subject || undefined : undefined,
          mergeData: SAMPLE_MERGE_DATA,
        },
        {
          onSuccess: (data) => setPreview(data),
          onError: () => setPreview(null),
        },
      );
    }, 500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, subject, channel, open]);

  const insertTag = (tag: string): void => {
    const insertText = `{{${tag}}}`;
    const textarea = bodyRef.current?.resizableTextArea?.textArea;
    if (!textarea) {
      form.setFieldValue('body', `${body}${insertText}`);
      return;
    }
    const start = textarea.selectionStart ?? body.length;
    const end = textarea.selectionEnd ?? body.length;
    const next = body.slice(0, start) + insertText + body.slice(end);
    form.setFieldValue('body', next);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + insertText.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const handleSubmit = (values: FormValues): void => {
    const payload: CreateTemplateInput = {
      name: values.name,
      channel: values.channel,
      category: values.category,
      body: values.body,
      ...(values.channel === 'email' && values.subject ? { subject: values.subject } : {}),
    };

    if (isEdit && template) {
      const { channel: _ch, ...updateInput } = payload;
      updateTemplate.mutate(
        { id: template._id, input: updateInput },
        {
          onSuccess: () => {
            void message.success('Template updated');
            onClose();
          },
          onError: () => {
            void message.error('Failed to update template');
          },
        },
      );
    } else {
      createTemplate.mutate(payload, {
        onSuccess: () => {
          void message.success('Template created');
          onClose();
        },
        onError: () => {
          void message.error('Failed to create template');
        },
      });
    }
  };

  const channelOptions = SINGLE_CHANNELS.map((c) => ({
    value: c,
    label: CHANNEL_LABELS[c],
  }));

  const categoryOptions = Object.entries(TEMPLATE_CATEGORY_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const submitting = createTemplate.isPending || updateTemplate.isPending;

  return (
    <Drawer
      title={isEdit ? `Edit template — ${template?.name}` : 'New broadcast template'}
      open={open}
      onClose={onClose}
      width={780}
      destroyOnClose
      footer={
        <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={submitting} onClick={() => form.submit()}>
            {isEdit ? 'Save changes' : 'Create template'}
          </Button>
        </Space>
      }
    >
      <Form<FormValues>
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ channel: 'sms', category: 'announcement' }}
      >
        <Form.Item
          name="name"
          label="Name"
          rules={[{ required: true, message: 'Name is required' }]}
        >
          <Input placeholder="e.g. Tax season — student return reminder" maxLength={200} />
        </Form.Item>

        <Space.Compact block>
          <Form.Item
            name="channel"
            label="Channel"
            style={{ flex: 1 }}
            rules={[{ required: true }]}
          >
            <Select options={channelOptions} disabled={isEdit} />
          </Form.Item>
          <Form.Item
            name="category"
            label="Category"
            style={{ flex: 1, marginLeft: 12 }}
            rules={[{ required: true }]}
          >
            <Select options={categoryOptions} />
          </Form.Item>
        </Space.Compact>

        {isEdit && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Channel cannot be changed after creation. Create a new template for a different channel."
          />
        )}

        {channel === 'email' && (
          <Form.Item
            name="subject"
            label="Subject line"
            rules={[{ required: true, message: 'Subject is required for email' }]}
          >
            <Input placeholder="e.g. Your {{financialYear}} return is ready to file" maxLength={500} />
          </Form.Item>
        )}

        <Form.Item label="Insert merge tag" tooltip="Click a tag to insert it at the cursor position. Falls back to a sensible default per recipient when data is missing.">
          <Space wrap size={[6, 6]}>
            {MERGE_TAGS.map((t) => (
              <Tooltip key={t.tag} title={`{{${t.tag}}} → ${t.sample}`}>
                <Tag
                  icon={<TagOutlined />}
                  color="blue"
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => insertTag(t.tag)}
                >
                  {t.label}
                </Tag>
              </Tooltip>
            ))}
          </Space>
        </Form.Item>

        <Form.Item
          name="body"
          label={channel === 'sms' ? 'SMS body' : channel === 'email' ? 'Email body' : 'WhatsApp body'}
          rules={[
            { required: true, message: 'Body is required' },
            { max: channel === 'sms' ? 1600 : 10000 },
          ]}
          extra={
            channel === 'sms'
              ? `${body.length} chars · ${Math.ceil((body.length || 1) / 160)} segment(s)`
              : `${body.length} chars`
          }
        >
          <Input.TextArea
            ref={bodyRef as never}
            rows={channel === 'sms' ? 5 : 10}
            placeholder={
              channel === 'sms'
                ? 'Hi {{firstName}}, your {{financialYear}} return is ready. Reply STOP to opt out.'
                : 'Hi {{firstName}},\n\nYour {{financialYear}} return is ready to file...'
            }
          />
        </Form.Item>
      </Form>

      <Divider orientation="left" plain>
        <Space>
          <EyeOutlined />
          Live preview (sample data)
        </Space>
      </Divider>

      <Card size="small" style={{ background: '#fafafa' }}>
        {preview ? (
          <div>
            {preview.subject && (
              <div style={{ marginBottom: 8, fontWeight: 500 }}>
                Subject: {preview.subject}
              </div>
            )}
            {channel === 'email' && preview.htmlBody ? (
              <div
                style={{
                  background: '#fff',
                  padding: 12,
                  borderRadius: 4,
                  border: '1px solid #eee',
                  maxHeight: 360,
                  overflow: 'auto',
                }}
                dangerouslySetInnerHTML={{ __html: preview.htmlBody }}
              />
            ) : (
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                  fontFamily: 'inherit',
                  fontSize: 13,
                }}
              >
                {preview.body}
              </pre>
            )}
          </div>
        ) : (
          <div style={{ color: '#999', textAlign: 'center', padding: 16 }}>
            {body
              ? 'Rendering preview…'
              : 'Type a body to see how it will render against sample recipient data.'}
          </div>
        )}
      </Card>
    </Drawer>
  );
}
