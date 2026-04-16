'use client';

import { useState, useMemo } from 'react';
import {
  Card,
  Steps,
  Form,
  Input,
  Select,
  Button,
  Space,
  Row,
  Col,
  DatePicker,
  Alert,
  Tag,
  Descriptions,
  Divider,
  Radio,
  App,
  Spin,
  Tooltip,
} from 'antd';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  SaveOutlined,
  SendOutlined,
  ClockCircleOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCreateCampaign,
  useSendCampaign,
  useTemplateList,
  usePreviewMessage,
} from '@/hooks/useBroadcasts';
import {
  CHANNEL_LABELS,
  CHANNEL_COLORS,
  AUDIENCE_TYPE_LABELS,
  MERGE_TAGS,
} from '@/types/broadcast';
import type {
  CampaignChannel,
  AudienceType,
  AudienceFilters,
  CreateCampaignInput,
  PreviewResult,
  SingleChannel,
  BroadcastTemplate,
} from '@/types/broadcast';

const ALL_CHANNELS: CampaignChannel[] = ['sms', 'email', 'whatsapp', 'sms_email', 'all'];

const SAMPLE_MERGE_DATA: Record<string, string> = MERGE_TAGS.reduce(
  (acc, t) => ({ ...acc, [t.tag]: t.sample }),
  {},
);

interface WizardState {
  // Step 1 — basics
  name: string;
  channel: CampaignChannel;
  // Step 2 — audience
  audienceType: AudienceType;
  audienceFilters: AudienceFilters;
  // Step 3 — content
  smsTemplateId?: string;
  emailTemplateId?: string;
  whatsappTemplateId?: string;
  smsBody?: string;
  emailSubject?: string;
  emailBody?: string;
  // Step 4 — schedule
  sendMode: 'now' | 'schedule';
  scheduledAt?: Dayjs;
}

const INITIAL: WizardState = {
  name: '',
  channel: 'sms',
  audienceType: 'all_leads',
  audienceFilters: {},
  sendMode: 'now',
};

function channelsForCampaign(c: CampaignChannel): SingleChannel[] {
  switch (c) {
    case 'sms':
      return ['sms'];
    case 'email':
      return ['email'];
    case 'whatsapp':
      return ['whatsapp'];
    case 'sms_email':
      return ['sms', 'email'];
    case 'all':
      return ['sms', 'email', 'whatsapp'];
  }
}

export function CampaignWizard(): React.ReactNode {
  const router = useRouter();
  const { message } = App.useApp();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(INITIAL);
  const [previewChannel, setPreviewChannel] = useState<SingleChannel>('sms');
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const createCampaign = useCreateCampaign();
  const sendCampaign = useSendCampaign();
  const previewMessage = usePreviewMessage();

  const channels = useMemo(() => channelsForCampaign(state.channel), [state.channel]);

  // Templates per channel
  const smsTemplates = useTemplateList(
    channels.includes('sms') ? { channel: 'sms', isActive: true, limit: 100 } : {},
  );
  const emailTemplates = useTemplateList(
    channels.includes('email') ? { channel: 'email', isActive: true, limit: 100 } : {},
  );
  const whatsappTemplates = useTemplateList(
    channels.includes('whatsapp') ? { channel: 'whatsapp', isActive: true, limit: 100 } : {},
  );

  const update = (patch: Partial<WizardState>): void => {
    setState((s) => ({ ...s, ...patch }));
  };

  // Auto-fill body fields when a template is picked
  const pickTemplate = (channel: SingleChannel, templateId: string | undefined): void => {
    if (channel === 'sms') {
      const tpl = smsTemplates.data?.data.find((t) => t._id === templateId);
      update({ smsTemplateId: templateId, smsBody: tpl?.body ?? state.smsBody });
    } else if (channel === 'email') {
      const tpl = emailTemplates.data?.data.find((t) => t._id === templateId);
      update({
        emailTemplateId: templateId,
        emailSubject: tpl?.subject ?? state.emailSubject,
        emailBody: tpl?.body ?? state.emailBody,
      });
    } else {
      update({ whatsappTemplateId: templateId });
    }
  };

  const runPreview = (channel: SingleChannel): void => {
    const body = channel === 'sms' ? state.smsBody : channel === 'email' ? state.emailBody : '';
    if (!body) {
      void message.warning(`No ${channel} body to preview`);
      return;
    }
    previewMessage.mutate(
      {
        channel,
        body,
        subject: channel === 'email' ? state.emailSubject : undefined,
        mergeData: SAMPLE_MERGE_DATA,
      },
      {
        onSuccess: (data) => {
          setPreviewChannel(channel);
          setPreview(data);
        },
        onError: () => void message.error('Preview failed'),
      },
    );
  };

  // Validation per step
  const canAdvance = (): boolean => {
    if (step === 0) {
      return state.name.trim().length > 0 && !!state.channel;
    }
    if (step === 1) {
      return !!state.audienceType;
    }
    if (step === 2) {
      // require body for each channel
      if (channels.includes('sms') && !state.smsBody) return false;
      if (channels.includes('email') && (!state.emailSubject || !state.emailBody)) return false;
      if (channels.includes('whatsapp') && !state.whatsappTemplateId) return false;
      return true;
    }
    if (step === 3) {
      if (state.sendMode === 'schedule') {
        return !!state.scheduledAt && state.scheduledAt.isAfter(dayjs());
      }
      return true;
    }
    return true;
  };

  const buildPayload = (): CreateCampaignInput => {
    const payload: CreateCampaignInput = {
      name: state.name.trim(),
      channel: state.channel,
      audienceType: state.audienceType,
      ...(Object.keys(state.audienceFilters).length > 0
        ? { audienceFilters: state.audienceFilters }
        : {}),
    };
    if (channels.includes('sms')) {
      if (state.smsTemplateId) payload.smsTemplateId = state.smsTemplateId;
      if (state.smsBody) payload.smsBody = state.smsBody;
    }
    if (channels.includes('email')) {
      if (state.emailTemplateId) payload.emailTemplateId = state.emailTemplateId;
      if (state.emailSubject) payload.emailSubject = state.emailSubject;
      if (state.emailBody) payload.emailBody = state.emailBody;
    }
    if (channels.includes('whatsapp')) {
      if (state.whatsappTemplateId) payload.whatsappTemplateId = state.whatsappTemplateId;
    }
    if (state.sendMode === 'schedule' && state.scheduledAt) {
      payload.scheduledAt = state.scheduledAt.toISOString();
    }
    return payload;
  };

  const handleSaveDraft = (): void => {
    const payload = buildPayload();
    createCampaign.mutate(payload, {
      onSuccess: (campaign) => {
        void message.success('Draft saved');
        router.push(`/broadcasts/${campaign._id}`);
      },
      onError: () => void message.error('Failed to save draft'),
    });
  };

  const handleSendNow = (): void => {
    const payload = buildPayload();
    createCampaign.mutate(payload, {
      onSuccess: (campaign) => {
        sendCampaign.mutate(campaign._id, {
          onSuccess: (res) => {
            void message.success(`Campaign queued (${res.totalQueued} recipients)`);
            router.push(`/broadcasts/${campaign._id}`);
          },
          onError: () => void message.error('Failed to send campaign'),
        });
      },
      onError: () => void message.error('Failed to create campaign'),
    });
  };

  const handleSchedule = (): void => {
    const payload = buildPayload();
    createCampaign.mutate(payload, {
      onSuccess: (campaign) => {
        sendCampaign.mutate(campaign._id, {
          onSuccess: () => {
            void message.success('Campaign scheduled');
            router.push(`/broadcasts/${campaign._id}`);
          },
          onError: () => void message.error('Failed to schedule campaign'),
        });
      },
      onError: () => void message.error('Failed to create campaign'),
    });
  };

  const submitting = createCampaign.isPending || sendCampaign.isPending;

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <Link href="/broadcasts">
            <Button icon={<ArrowLeftOutlined />}>Campaigns</Button>
          </Link>
          <h2 style={{ margin: 0 }}>New broadcast campaign</h2>
        </Space>
      </div>

      <Card>
        <Steps
          current={step}
          style={{ marginBottom: 24 }}
          items={[
            { title: 'Basics' },
            { title: 'Audience' },
            { title: 'Content' },
            { title: 'Schedule' },
            { title: 'Review' },
          ]}
        />

        {step === 0 && (
          <Form layout="vertical">
            <Form.Item label="Campaign name" required>
              <Input
                value={state.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="e.g. October student return reminder"
                maxLength={200}
              />
            </Form.Item>
            <Form.Item label="Channel" required>
              <Radio.Group
                value={state.channel}
                onChange={(e) => update({ channel: e.target.value as CampaignChannel })}
              >
                {ALL_CHANNELS.map((c) => (
                  <Radio.Button key={c} value={c}>
                    {CHANNEL_LABELS[c]}
                  </Radio.Button>
                ))}
              </Radio.Group>
            </Form.Item>
            <Alert
              type="info"
              showIcon
              message="Choose one or more channels. The same audience will receive the message via every selected channel where they have a contact."
            />
          </Form>
        )}

        {step === 1 && (
          <Form layout="vertical">
            <Form.Item label="Audience" required>
              <Select
                value={state.audienceType}
                onChange={(val) => update({ audienceType: val as AudienceType })}
                options={Object.entries(AUDIENCE_TYPE_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </Form.Item>

            {(state.audienceType === 'filtered_leads' ||
              state.audienceType === 'filtered_users') && (
              <>
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item label="States (AU)">
                      <Select
                        mode="tags"
                        placeholder="VIC, NSW, QLD…"
                        value={state.audienceFilters.state ?? []}
                        onChange={(val) =>
                          update({
                            audienceFilters: { ...state.audienceFilters, state: val as string[] },
                          })
                        }
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="Tags">
                      <Select
                        mode="tags"
                        placeholder="vip, returning…"
                        value={state.audienceFilters.tags ?? []}
                        onChange={(val) =>
                          update({
                            audienceFilters: { ...state.audienceFilters, tags: val as string[] },
                          })
                        }
                      />
                    </Form.Item>
                  </Col>
                </Row>
                {state.audienceType === 'filtered_leads' && (
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item label="Lead status">
                        <Select
                          mode="tags"
                          placeholder="new, contacted, qualified…"
                          value={state.audienceFilters.leadStatus ?? []}
                          onChange={(val) =>
                            update({
                              audienceFilters: {
                                ...state.audienceFilters,
                                leadStatus: val as string[],
                              },
                            })
                          }
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="Priority">
                        <Select
                          mode="tags"
                          placeholder="high, medium, low"
                          value={state.audienceFilters.priority ?? []}
                          onChange={(val) =>
                            update({
                              audienceFilters: {
                                ...state.audienceFilters,
                                priority: val as string[],
                              },
                            })
                          }
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                )}
                <Form.Item label="Financial year">
                  <Input
                    placeholder="2025-2026"
                    value={state.audienceFilters.financialYear ?? ''}
                    onChange={(e) =>
                      update({
                        audienceFilters: {
                          ...state.audienceFilters,
                          financialYear: e.target.value || undefined,
                        },
                      })
                    }
                  />
                </Form.Item>
              </>
            )}

            {state.audienceType === 'custom_list' && (
              <Alert
                type="warning"
                showIcon
                message="Custom recipient lists are not yet supported in the wizard. Use the API or save as draft and edit."
              />
            )}

            <Alert
              type="info"
              showIcon
              message="Recipients on the DND/opt-out list are excluded automatically. The exact count is recalculated when the campaign is sent."
            />
          </Form>
        )}

        {step === 2 && (
          <Form layout="vertical">
            {channels.includes('sms') && (
              <ChannelContentBlock
                title="SMS"
                color={CHANNEL_COLORS.sms}
                templates={smsTemplates.data?.data ?? []}
                templatesLoading={smsTemplates.isLoading}
                templateId={state.smsTemplateId}
                onTemplate={(id) => pickTemplate('sms', id)}
                body={state.smsBody ?? ''}
                onBody={(v) => update({ smsBody: v, smsTemplateId: undefined })}
                onPreview={() => runPreview('sms')}
                showSubject={false}
              />
            )}
            {channels.includes('email') && (
              <ChannelContentBlock
                title="Email"
                color={CHANNEL_COLORS.email}
                templates={emailTemplates.data?.data ?? []}
                templatesLoading={emailTemplates.isLoading}
                templateId={state.emailTemplateId}
                onTemplate={(id) => pickTemplate('email', id)}
                subject={state.emailSubject ?? ''}
                onSubject={(v) => update({ emailSubject: v, emailTemplateId: undefined })}
                body={state.emailBody ?? ''}
                onBody={(v) => update({ emailBody: v, emailTemplateId: undefined })}
                onPreview={() => runPreview('email')}
                showSubject
              />
            )}
            {channels.includes('whatsapp') && (
              <Card
                size="small"
                title={<Tag color={CHANNEL_COLORS.whatsapp}>WhatsApp</Tag>}
                style={{ marginBottom: 16 }}
              >
                <Form.Item
                  label="WhatsApp template"
                  required
                  tooltip="WhatsApp requires a Meta-approved template"
                >
                  <Select
                    placeholder="Pick approved template"
                    loading={whatsappTemplates.isLoading}
                    value={state.whatsappTemplateId}
                    onChange={(id) => pickTemplate('whatsapp', id)}
                    options={(whatsappTemplates.data?.data ?? []).map((t) => ({
                      value: t._id,
                      label: t.name,
                    }))}
                    allowClear
                  />
                </Form.Item>
                <Alert
                  type="info"
                  showIcon
                  message="WhatsApp template parameter binding is configured per template — ask the developer to wire params for new templates."
                />
              </Card>
            )}

            {preview && (
              <Card
                size="small"
                title={`Preview — ${CHANNEL_LABELS[previewChannel]}`}
                style={{ marginTop: 8, background: '#fafafa' }}
              >
                {preview.subject && (
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>Subject: {preview.subject}</div>
                )}
                {previewChannel === 'email' && preview.htmlBody ? (
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
              </Card>
            )}
          </Form>
        )}

        {step === 3 && (
          <Form layout="vertical">
            <Form.Item label="When should this go out?">
              <Radio.Group
                value={state.sendMode}
                onChange={(e) => update({ sendMode: e.target.value as 'now' | 'schedule' })}
              >
                <Radio.Button value="now">
                  <SendOutlined /> Send now
                </Radio.Button>
                <Radio.Button value="schedule">
                  <ClockCircleOutlined /> Schedule for later
                </Radio.Button>
              </Radio.Group>
            </Form.Item>
            {state.sendMode === 'schedule' && (
              <Form.Item label="Send at (Australia/Sydney)" required>
                <DatePicker
                  showTime={{ format: 'HH:mm' }}
                  format="DD/MM/YYYY HH:mm"
                  value={state.scheduledAt}
                  onChange={(val) => update({ scheduledAt: val ?? undefined })}
                  disabledDate={(d) => d.isBefore(dayjs().startOf('day'))}
                />
              </Form.Item>
            )}
            <Alert
              type="warning"
              showIcon
              message="The audience and total recipients will be recalculated at send time, so the count on the next step is an estimate."
            />
          </Form>
        )}

        {step === 4 && (
          <div>
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Name">{state.name}</Descriptions.Item>
              <Descriptions.Item label="Channel">
                <Tag color={CHANNEL_COLORS[state.channel]}>{CHANNEL_LABELS[state.channel]}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Audience">
                {AUDIENCE_TYPE_LABELS[state.audienceType]}
                {Object.keys(state.audienceFilters).length > 0 && (
                  <div style={{ marginTop: 4, color: '#666', fontSize: 12 }}>
                    Filters: {JSON.stringify(state.audienceFilters)}
                  </div>
                )}
              </Descriptions.Item>
              {channels.includes('sms') && (
                <Descriptions.Item label="SMS body">
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: 13,
                    }}
                  >
                    {state.smsBody}
                  </pre>
                </Descriptions.Item>
              )}
              {channels.includes('email') && (
                <>
                  <Descriptions.Item label="Email subject">{state.emailSubject}</Descriptions.Item>
                  <Descriptions.Item label="Email body">
                    <pre
                      style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'inherit',
                        fontSize: 13,
                      }}
                    >
                      {state.emailBody}
                    </pre>
                  </Descriptions.Item>
                </>
              )}
              {channels.includes('whatsapp') && (
                <Descriptions.Item label="WhatsApp template">
                  {whatsappTemplates.data?.data.find((t) => t._id === state.whatsappTemplateId)
                    ?.name ?? '—'}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Schedule">
                {state.sendMode === 'now'
                  ? 'Send immediately on submit'
                  : (state.scheduledAt?.format('DD/MM/YYYY HH:mm') ?? '—')}
              </Descriptions.Item>
            </Descriptions>
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 16 }}
              message="Pressing the action button below will create the campaign and immediately queue or schedule it. Use 'Save as draft' to keep editing."
            />
          </div>
        )}

        <Divider />

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button
            disabled={step === 0 || submitting}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </Button>
          <Space>
            <Button icon={<SaveOutlined />} onClick={handleSaveDraft} loading={submitting}>
              Save as draft
            </Button>
            {step < 4 ? (
              <Button
                type="primary"
                disabled={!canAdvance()}
                onClick={() => setStep((s) => Math.min(4, s + 1))}
                icon={<ArrowRightOutlined />}
              >
                Next
              </Button>
            ) : state.sendMode === 'now' ? (
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={submitting}
                onClick={handleSendNow}
              >
                Create &amp; send now
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<ClockCircleOutlined />}
                loading={submitting}
                onClick={handleSchedule}
              >
                Create &amp; schedule
              </Button>
            )}
          </Space>
        </div>
      </Card>
    </div>
  );
}

// ─── Sub-component: per-channel content block ─────────────────────────

interface BlockProps {
  title: string;
  color: string;
  templates: BroadcastTemplate[];
  templatesLoading: boolean;
  templateId?: string;
  onTemplate: (id: string | undefined) => void;
  showSubject: boolean;
  subject?: string;
  onSubject?: (v: string) => void;
  body: string;
  onBody: (v: string) => void;
  onPreview: () => void;
}

function ChannelContentBlock({
  title,
  color,
  templates,
  templatesLoading,
  templateId,
  onTemplate,
  showSubject,
  subject,
  onSubject,
  body,
  onBody,
  onPreview,
}: BlockProps): React.ReactNode {
  return (
    <Card size="small" title={<Tag color={color}>{title}</Tag>} style={{ marginBottom: 16 }}>
      <Form.Item label="Start from a template (optional)">
        <Select
          allowClear
          placeholder={templatesLoading ? 'Loading…' : 'Pick an existing template'}
          loading={templatesLoading}
          value={templateId}
          onChange={(id) => onTemplate(id)}
          options={templates.map((t) => ({
            value: t._id,
            label: t.name,
          }))}
        />
      </Form.Item>
      {showSubject && (
        <Form.Item label="Subject" required>
          <Input
            value={subject}
            onChange={(e) => onSubject?.(e.target.value)}
            placeholder="Subject line"
            maxLength={500}
          />
        </Form.Item>
      )}
      <Form.Item label="Insert merge tag">
        <Space wrap size={[6, 6]}>
          {MERGE_TAGS.slice(0, 6).map((t) => (
            <Tooltip key={t.tag} title={`{{${t.tag}}} → ${t.sample}`}>
              <Tag
                color="blue"
                style={{ cursor: 'pointer', userSelect: 'none' }}
                onClick={() => onBody(`${body}{{${t.tag}}}`)}
              >
                {t.label}
              </Tag>
            </Tooltip>
          ))}
        </Space>
      </Form.Item>
      <Form.Item label="Body" required>
        <Input.TextArea
          rows={title === 'SMS' ? 5 : 10}
          value={body}
          onChange={(e) => onBody(e.target.value)}
          placeholder={
            title === 'SMS'
              ? 'Hi {{firstName}}, your {{financialYear}} return is ready. Reply STOP to opt out.'
              : 'Hi {{firstName}},\n\nYour {{financialYear}} return is ready…'
          }
        />
      </Form.Item>
      <Button icon={<EyeOutlined />} onClick={onPreview} size="small">
        Preview {title}
      </Button>
    </Card>
  );
}
