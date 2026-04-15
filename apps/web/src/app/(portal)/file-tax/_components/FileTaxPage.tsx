'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Radio,
  Result,
  Row,
  Select,
  Space,
  Spin,
  Steps,
  Tag,
  Typography,
  message,
  theme,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloudSyncOutlined,
  DeleteOutlined,
  FileTextOutlined,
  FormOutlined,
  PlayCircleOutlined,
  RocketOutlined,
  SaveOutlined,
  SmileOutlined,
  SolutionOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/lib/auth/useAuth';
import {
  useAvailableFormMappings,
  useSubmitFormFill,
  useFormDrafts,
  useSaveDraft,
  useDeleteDraft,
  type FormDraft,
} from '@/hooks/useFormFill';
import { useCreditBalance, useValidatePromoCode } from '@/hooks/useCredits';
import { formatCurrency } from '@/lib/utils/format';
import type { AvailableFormMapping, FormMappingWidget } from '@/types/formMapping';
import type { PromoCodeValidationResult } from '@/types/credit';

const { Title, Text, Paragraph } = Typography;

// ─── Schema Parser ─────────────────────────────────────────────────────────

interface ParsedField {
  key: string;
  label: string;
  widget: FormMappingWidget;
  required: boolean;
  description?: string;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  step?: string;
}

interface FormStep {
  id: string;
  title: string;
  description?: string;
  fields: ParsedField[];
}

interface ParsedForm {
  steps: FormStep[];
}

function guessWidget(prop: Record<string, unknown>): FormMappingWidget {
  if (prop.type === 'boolean') return 'checkbox';
  if (prop.type === 'number' || prop.type === 'integer') return 'number';
  if (prop.format === 'date') return 'date';
  if (prop.enum) return 'select';
  return 'text';
}

function parseField(key: string, prop: Record<string, unknown>, required: boolean): ParsedField {
  const xQegos = (prop['x-qegos'] ?? {}) as Record<string, unknown>;
  const widget = (xQegos.widget ?? guessWidget(prop)) as FormMappingWidget;
  const field: ParsedField = {
    key,
    label: (prop.title ?? key) as string,
    widget,
    required,
    description: prop.description as string | undefined,
    placeholder: xQegos.placeholder as string | undefined,
    step: xQegos.step as string | undefined,
  };

  if (prop.enum && Array.isArray(prop.enum)) {
    const labels = (xQegos.enumLabels ?? prop.enum) as string[];
    field.options = (prop.enum as string[]).map((val, i) => ({
      label: labels[i] ?? val,
      value: val,
    }));
  }
  if (prop.oneOf && Array.isArray(prop.oneOf)) {
    field.options = (prop.oneOf as Array<{ const: string; title: string }>).map((item) => ({
      label: item.title ?? String(item.const),
      value: String(item.const),
    }));
  }
  return field;
}

function parseFormSchema(schema: Record<string, unknown>, uiOrder: string[]): ParsedForm {
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const requiredFields = (schema.required ?? []) as string[];

  // Collect all field entries (skip step-container objects whose children are in uiOrder)
  const stepIds = new Set(uiOrder);
  const allFields: ParsedField[] = [];
  for (const [key, prop] of Object.entries(properties)) {
    // If this key is a step container (type: object with own properties), unfold its children
    if (prop.type === 'object' && prop.properties) {
      const nested = prop.properties as Record<string, Record<string, unknown>>;
      const nestedRequired = (prop.required ?? []) as string[];
      for (const [nk, np] of Object.entries(nested)) {
        // annotate with step if not already set
        const xQ = (np['x-qegos'] ?? {}) as Record<string, unknown>;
        if (!xQ.step) xQ.step = key;
        (np as Record<string, unknown>)['x-qegos'] = xQ;
        allFields.push(parseField(nk, np, nestedRequired.includes(nk)));
      }
    } else if (!stepIds.has(key)) {
      // regular scalar field
      allFields.push(parseField(key, prop, requiredFields.includes(key)));
    }
  }

  // Build steps
  const steps: FormStep[] = [];
  if (uiOrder.length > 0) {
    for (const stepId of uiOrder) {
      const stepProp = properties[stepId] ?? {};
      const fields = allFields.filter((f) => f.step === stepId);
      steps.push({
        id: stepId,
        title: (stepProp.title as string | undefined) ?? toTitleCase(stepId),
        description: stepProp.description as string | undefined,
        fields,
      });
    }
    // Move orphan fields (no step) into first step as a fallback
    const orphans = allFields.filter((f) => !f.step || !stepIds.has(f.step));
    if (orphans.length > 0 && steps.length > 0) {
      steps[0].fields.push(...orphans);
    } else if (orphans.length > 0) {
      steps.push({ id: '_main', title: 'Details', fields: orphans });
    }
  } else {
    // No uiOrder defined: single step with all fields
    steps.push({ id: '_main', title: 'Details', fields: allFields });
  }

  return { steps: steps.filter((s) => s.fields.length > 0) };
}

function toTitleCase(s: string): string {
  return s
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// ─── Field Renderer ────────────────────────────────────────────────────────

function renderField(field: ParsedField): React.ReactNode {
  switch (field.widget) {
    case 'text':
      return <Input placeholder={field.placeholder} size="large" />;
    case 'textarea':
      return <Input.TextArea placeholder={field.placeholder} rows={3} />;
    case 'number':
      return <InputNumber style={{ width: '100%' }} placeholder={field.placeholder} size="large" />;
    case 'currency':
      return (
        <InputNumber
          prefix="$"
          style={{ width: '100%' }}
          min={0}
          precision={2}
          placeholder={field.placeholder}
          size="large"
        />
      );
    case 'date':
      return <DatePicker style={{ width: '100%' }} size="large" />;
    case 'select':
      return (
        <Select
          placeholder={field.placeholder ?? 'Select an option'}
          options={field.options}
          allowClear
          size="large"
        />
      );
    case 'radio':
      return (
        <Radio.Group>
          <Space direction="vertical">
            {field.options?.map((opt) => (
              <Radio key={opt.value} value={opt.value}>
                {opt.label}
              </Radio>
            ))}
          </Space>
        </Radio.Group>
      );
    case 'checkbox':
      return <Checkbox>{field.description}</Checkbox>;
    case 'multi_select':
      return (
        <Select
          mode="multiple"
          placeholder={field.placeholder ?? 'Select options'}
          options={field.options}
          allowClear
          size="large"
        />
      );
    case 'file_upload':
      return <Input type="file" size="large" />;
    default:
      return <Input placeholder={field.placeholder} size="large" />;
  }
}

// ─── Time helper ───────────────────────────────────────────────────────────

function formatTimeAgo(iso: string | Date | null): string {
  if (!iso) return '';
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function FileTaxPage(): React.ReactNode {
  const router = useRouter();
  const { user } = useAuth();
  const { token: t } = theme.useToken();
  const { data: mappings, isLoading } = useAvailableFormMappings();
  const { data: drafts } = useFormDrafts();
  const submitMutation = useSubmitFormFill();
  const saveDraftMutation = useSaveDraft();
  const deleteDraftMutation = useDeleteDraft();
  const { data: creditData } = useCreditBalance();
  const validatePromoMutation = useValidatePromoCode();

  // ── State ───────────────────────────────────────────────────────────────
  const [selectedMapping, setSelectedMapping] = useState<AvailableFormMapping | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [formAnswers, setFormAnswers] = useState<Record<string, unknown>>({});
  const [personalDetails, setPersonalDetails] = useState<{
    firstName: string;
    lastName: string;
    email?: string;
    mobile?: string;
  }>({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    email: user?.email ?? '',
    mobile: '',
  });
  const [promoCode, setPromoCode] = useState('');
  const [promoResult, setPromoResult] = useState<PromoCodeValidationResult | null>(null);
  const [useCredits, setUseCredits] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<{ orderId: string; orderNumber: string } | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [, setTick] = useState(0);

  const [formInstance] = Form.useForm();
  const [personalForm] = Form.useForm();
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Parse form schema → grouped steps
  const parsedForm = useMemo<ParsedForm>(() => {
    if (!selectedMapping) return { steps: [] };
    return parseFormSchema(
      selectedMapping.schema as Record<string, unknown>,
      selectedMapping.uiOrder ?? [],
    );
  }, [selectedMapping]);

  const totalFormSteps = parsedForm.steps.length;
  // Stepper steps: [form steps..., Personal Details, Review, Done]
  const stepperItems = useMemo(() => {
    const items: Array<{ title: string; icon: React.ReactNode }> = [];
    parsedForm.steps.forEach((s, i) => {
      items.push({
        title: s.title,
        icon: i === 0 ? <FormOutlined /> : <SolutionOutlined />,
      });
    });
    items.push({ title: 'Personal Details', icon: <UserOutlined /> });
    items.push({ title: 'Review & Submit', icon: <CheckCircleOutlined /> });
    items.push({ title: 'Done', icon: <SmileOutlined /> });
    return items;
  }, [parsedForm]);

  const personalDetailsStepIdx = totalFormSteps;
  const reviewStepIdx = totalFormSteps + 1;
  const doneStepIdx = totalFormSteps + 2;

  // ── Ticker for "saved Xs ago" display ────────────────────────────────
  useEffect(() => {
    if (!lastSavedAt) return;
    const id = setInterval(() => { setTick((n) => n + 1); }, 5000);
    return () => { clearInterval(id); };
  }, [lastSavedAt]);

  // ── Save draft helper ────────────────────────────────────────────────
  const saveDraft = useCallback(
    (opts: { step?: number; answers?: Record<string, unknown>; personal?: typeof personalDetails; silent?: boolean }) => {
      if (!selectedMapping) return;
      const step = opts.step ?? currentStep;
      const answers = opts.answers ?? formAnswers;
      const personal = opts.personal ?? personalDetails;
      saveDraftMutation.mutate(
        {
          mappingId: selectedMapping.mappingId,
          versionNumber: selectedMapping.version,
          financialYear: selectedMapping.financialYear,
          currentStep: step,
          answers,
          personalDetails: personal as unknown as Record<string, unknown>,
          serviceTitle: selectedMapping.serviceTitle,
          servicePrice: selectedMapping.servicePrice,
          formTitle: selectedMapping.title,
        },
        {
          onSuccess: (data) => {
            setCurrentDraftId(data.draft._id);
            setLastSavedAt(new Date());
          },
          onError: () => {
            if (!opts.silent) void message.error('Failed to auto-save. Your progress may not be saved.');
          },
        },
      );
    },
    [selectedMapping, currentStep, formAnswers, personalDetails, saveDraftMutation],
  );

  // ── Debounced auto-save on field change ──────────────────────────────
  const scheduleAutoSave = useCallback(
    (values: Record<string, unknown>) => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = setTimeout(() => {
        const merged = { ...formAnswers, ...values };
        setFormAnswers(merged);
        saveDraft({ answers: merged, silent: true });
      }, 1500);
    },
    [formAnswers, saveDraft],
  );

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleSelectMapping = useCallback((mapping: AvailableFormMapping) => {
    // Check if a draft exists for this mapping
    const existing = drafts?.find(
      (d) => d.mappingId === mapping.mappingId && d.financialYear === mapping.financialYear,
    );
    if (existing) {
      Modal.confirm({
        title: 'Resume where you left off?',
        icon: <CloudSyncOutlined style={{ color: t.colorPrimary }} />,
        content: `You have a saved draft for ${mapping.serviceTitle} (FY ${mapping.financialYear}). Continue from there?`,
        okText: 'Resume Draft',
        cancelText: 'Start Fresh',
        onOk: () => { resumeDraft(mapping, existing); },
        onCancel: () => { startFresh(mapping); },
      });
    } else {
      startFresh(mapping);
    }
  }, [drafts, t.colorPrimary]);

  const resumeDraft = useCallback((mapping: AvailableFormMapping, draft: FormDraft) => {
    setSelectedMapping(mapping);
    setCurrentDraftId(draft._id);
    setFormAnswers(draft.answers ?? {});
    setPersonalDetails({
      firstName: draft.personalDetails?.firstName ?? user?.firstName ?? '',
      lastName: draft.personalDetails?.lastName ?? user?.lastName ?? '',
      email: draft.personalDetails?.email ?? user?.email ?? '',
      mobile: draft.personalDetails?.mobile ?? '',
    });
    setCurrentStep(Math.min(draft.currentStep, totalFormSteps + 1));
    formInstance.setFieldsValue(draft.answers ?? {});
    setLastSavedAt(draft.updatedAt ? new Date(draft.updatedAt) : null);
  }, [formInstance, user, totalFormSteps]);

  const startFresh = useCallback((mapping: AvailableFormMapping) => {
    setSelectedMapping(mapping);
    setCurrentDraftId(null);
    setFormAnswers({});
    setCurrentStep(0);
    formInstance.resetFields();
    setLastSavedAt(null);
  }, [formInstance]);

  const handleContinueDraft = useCallback((draft: FormDraft) => {
    const mapping = mappings?.find((m) => m.mappingId === draft.mappingId);
    if (!mapping) {
      void message.warning('This form is no longer available.');
      return;
    }
    resumeDraft(mapping, draft);
  }, [mappings, resumeDraft]);

  const handleDiscardDraft = useCallback((draftId: string) => {
    deleteDraftMutation.mutate(draftId, {
      onSuccess: () => { void message.success('Draft discarded'); },
      onError: () => { void message.error('Failed to discard draft'); },
    });
  }, [deleteDraftMutation]);

  const handleExitToDrafts = useCallback(() => {
    // Save one final time then return to landing
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    formInstance
      .validateFields({ validateOnly: true })
      .catch(() => { /* ignore validation for silent save */ })
      .finally(() => {
        const values = formInstance.getFieldsValue(true) as Record<string, unknown>;
        const merged = { ...formAnswers, ...values };
        setFormAnswers(merged);
        saveDraft({ answers: merged });
        setSelectedMapping(null);
        setCurrentDraftId(null);
        setCurrentStep(0);
      });
  }, [formInstance, formAnswers, saveDraft]);

  const handleFormStepNext = useCallback(() => {
    formInstance
      .validateFields()
      .then((values: Record<string, unknown>) => {
        const merged = { ...formAnswers, ...values };
        setFormAnswers(merged);
        const next = currentStep + 1;
        setCurrentStep(next);
        saveDraft({ step: next, answers: merged });
        // Pre-fill personal details when entering that step
        if (next === personalDetailsStepIdx) {
          personalForm.setFieldsValue(personalDetails);
        }
      })
      .catch(() => {
        void message.warning('Please fill in all required fields');
      });
  }, [currentStep, formAnswers, formInstance, personalForm, personalDetails, personalDetailsStepIdx, saveDraft]);

  const handleFormStepBack = useCallback(() => {
    const values = formInstance.getFieldsValue(true) as Record<string, unknown>;
    const merged = { ...formAnswers, ...values };
    setFormAnswers(merged);
    const prev = Math.max(0, currentStep - 1);
    setCurrentStep(prev);
    saveDraft({ step: prev, answers: merged });
  }, [currentStep, formAnswers, formInstance, saveDraft]);

  const handlePersonalNext = useCallback(() => {
    personalForm
      .validateFields()
      .then((values: typeof personalDetails) => {
        setPersonalDetails(values);
        setCurrentStep(reviewStepIdx);
        saveDraft({ step: reviewStepIdx, personal: values });
      })
      .catch(() => {
        void message.warning('Please fill in all required fields');
      });
  }, [personalForm, reviewStepIdx, saveDraft]);

  const handleValidatePromo = useCallback(() => {
    if (!promoCode.trim() || !selectedMapping) return;
    validatePromoMutation.mutate(
      {
        code: promoCode,
        orderAmount: selectedMapping.servicePrice,
        salesItemId: selectedMapping.salesItemId,
      },
      {
        onSuccess: (result) => {
          setPromoResult(result);
          if (!result.valid) {
            void message.warning(result.message ?? 'Invalid promo code');
          } else {
            void message.success(`Promo applied! -${formatCurrency(result.calculatedDiscount)}`);
          }
        },
        onError: () => { void message.error('Failed to validate promo code'); },
      },
    );
  }, [promoCode, selectedMapping, validatePromoMutation]);

  const pricing = useMemo(() => {
    if (!selectedMapping) return { subtotal: 0, discount: 0, creditUsed: 0, total: 0 };
    const subtotal = selectedMapping.servicePrice;
    const discount = promoResult?.valid ? promoResult.calculatedDiscount : 0;
    const afterDiscount = subtotal - discount;
    const creditBalance = creditData?.balance ?? 0;
    const creditUsed = useCredits ? Math.min(creditBalance, afterDiscount) : 0;
    const total = afterDiscount - creditUsed;
    return { subtotal, discount, creditUsed, total };
  }, [selectedMapping, promoResult, useCredits, creditData]);

  const handleSubmit = useCallback(() => {
    if (!selectedMapping) return;
    submitMutation.mutate(
      {
        mappingId: selectedMapping.mappingId,
        versionNumber: selectedMapping.version,
        financialYear: selectedMapping.financialYear,
        personalDetails,
        answers: formAnswers,
        promoCode: promoResult?.valid ? promoCode : undefined,
        useCredits: useCredits && pricing.creditUsed > 0 ? true : undefined,
        draftId: currentDraftId ?? undefined,
      },
      {
        onSuccess: (result) => {
          setSubmittedOrder({ orderId: result.orderId, orderNumber: result.orderNumber });
          setCurrentStep(doneStepIdx);
          setCurrentDraftId(null);
        },
        onError: () => { void message.error('Failed to submit form. Please try again.'); },
      },
    );
  }, [selectedMapping, personalDetails, formAnswers, submitMutation, promoCode, promoResult, useCredits, pricing, currentDraftId, doneStepIdx]);

  // ── Loading ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LANDING VIEW — show drafts + service picker
  // ═══════════════════════════════════════════════════════════════════════
  if (!selectedMapping) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Hero */}
        <div
          style={{
            background: `linear-gradient(135deg, ${t.colorPrimary} 0%, ${t.colorPrimaryActive} 100%)`,
            borderRadius: 16,
            padding: '32px 40px',
            color: '#fff',
            marginBottom: 24,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'relative', zIndex: 2 }}>
            <Title level={2} style={{ color: '#fff', marginBottom: 8 }}>
              File your tax return in minutes
            </Title>
            <Paragraph style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15, marginBottom: 0, maxWidth: 620 }}>
              Pick a service, answer a few questions, and we'll take it from there. Your progress is auto-saved — come back anytime.
            </Paragraph>
          </div>
          <RocketOutlined
            style={{
              position: 'absolute',
              right: 40,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 120,
              color: 'rgba(255,255,255,0.12)',
            }}
          />
        </div>

        {/* Resume drafts strip */}
        {drafts && drafts.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <CloudSyncOutlined style={{ color: t.colorPrimary, fontSize: 18 }} />
              <Title level={5} style={{ margin: 0 }}>Continue where you left off</Title>
              <Badge count={drafts.length} style={{ backgroundColor: t.colorPrimary }} />
            </div>
            <Row gutter={[16, 16]}>
              {drafts.map((draft) => (
                <Col xs={24} sm={12} md={8} key={draft._id}>
                  <Card
                    size="small"
                    style={{
                      borderLeft: `4px solid ${t.colorPrimary}`,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    }}
                    actions={[
                      <Button
                        key="continue"
                        type="primary"
                        size="small"
                        icon={<PlayCircleOutlined />}
                        onClick={() => { handleContinueDraft(draft); }}
                      >
                        Continue
                      </Button>,
                      <Popconfirm
                        key="discard"
                        title="Discard this draft?"
                        okText="Yes, discard"
                        cancelText="Cancel"
                        onConfirm={() => { handleDiscardDraft(draft._id); }}
                      >
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                      </Popconfirm>,
                    ]}
                  >
                    <div style={{ marginBottom: 8 }}>
                      <Text strong style={{ fontSize: 14 }} ellipsis>{draft.serviceTitle}</Text>
                      <br />
                      <Tag color="blue" style={{ marginTop: 4 }}>FY {draft.financialYear}</Tag>
                    </div>
                    <div style={{ fontSize: 12, color: t.colorTextSecondary, marginBottom: 6 }}>
                      <ClockCircleOutlined /> Saved {formatTimeAgo(draft.updatedAt)}
                    </div>
                    <Progress
                      percent={Math.min(100, Math.round(((draft.currentStep + 1) / 4) * 100))}
                      size="small"
                      strokeColor={t.colorPrimary}
                    />
                  </Card>
                </Col>
              ))}
            </Row>
            <Divider />
          </div>
        )}

        {/* Service picker */}
        <Title level={4} style={{ marginBottom: 4 }}>Choose a service</Title>
        <Paragraph type="secondary" style={{ marginBottom: 20 }}>
          Select the tax filing service that fits your needs.
        </Paragraph>

        {!mappings || mappings.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: 40 }}>
            <Empty
              image={<FileTextOutlined style={{ fontSize: 64, color: t.colorTextQuaternary }} />}
              description={
                <>
                  <Title level={5} style={{ marginTop: 12 }}>No tax forms available yet</Title>
                  <Text type="secondary">Please check back later or contact support.</Text>
                </>
              }
            />
          </Card>
        ) : (
          <Row gutter={[16, 16]}>
            {mappings.map((mapping) => (
              <Col xs={24} md={12} key={mapping.mappingId}>
                <Card
                  hoverable
                  onClick={() => { handleSelectMapping(mapping); }}
                  style={{
                    cursor: 'pointer',
                    height: '100%',
                    borderRadius: 12,
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                  styles={{ body: { padding: 24 } }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Tag color="geekblue" style={{ marginBottom: 8 }}>
                        {mapping.serviceCategory?.toUpperCase() ?? 'TAX'}
                      </Tag>
                      <Title level={5} style={{ margin: '4px 0 4px', lineHeight: 1.3 }}>
                        {mapping.serviceTitle}
                      </Title>
                      <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
                        FY {mapping.financialYear} · {mapping.title}
                      </Text>
                      {mapping.description && (
                        <Paragraph
                          type="secondary"
                          style={{ fontSize: 13, marginBottom: 12 }}
                          ellipsis={{ rows: 2 }}
                        >
                          {mapping.description}
                        </Paragraph>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 11, color: t.colorTextTertiary }}>Starting at</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: t.colorPrimary, lineHeight: 1.2 }}>
                        {formatCurrency(mapping.servicePrice)}
                      </div>
                    </div>
                  </div>
                  <Button type="primary" block style={{ marginTop: 16 }} icon={<PlayCircleOutlined />}>
                    Start filing
                  </Button>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FORM FLOW
  // ═══════════════════════════════════════════════════════════════════════
  const progressPct = Math.round(((currentStep + 1) / stepperItems.length) * 100);
  const activeFormStep = currentStep < totalFormSteps ? parsedForm.steps[currentStep] : null;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Sticky progress header */}
      <Card
        style={{
          marginBottom: 20,
          borderRadius: 12,
          border: `1px solid ${t.colorBorderSecondary}`,
          position: 'sticky',
          top: 76,
          zIndex: 5,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
        styles={{ body: { padding: '16px 20px' } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text strong style={{ fontSize: 15 }}>{selectedMapping.serviceTitle}</Text>
            <Text type="secondary" style={{ marginLeft: 8, fontSize: 13 }}>FY {selectedMapping.financialYear}</Text>
          </div>
          <Space size="small">
            {saveDraftMutation.isPending ? (
              <Tag icon={<CloudSyncOutlined spin />} color="processing">Saving…</Tag>
            ) : lastSavedAt ? (
              <Tag icon={<CheckCircleOutlined />} color="success">
                Saved {formatTimeAgo(lastSavedAt)}
              </Tag>
            ) : null}
            {currentStep !== doneStepIdx && (
              <Button size="small" icon={<SaveOutlined />} onClick={handleExitToDrafts}>
                Save &amp; Exit
              </Button>
            )}
          </Space>
        </div>
        <Progress
          percent={progressPct}
          size="small"
          showInfo={false}
          strokeColor={{ from: t.colorPrimary, to: t.colorPrimaryActive }}
        />
      </Card>

      {/* Stepper */}
      <Steps
        current={currentStep}
        items={stepperItems}
        size="small"
        style={{ marginBottom: 28 }}
        responsive
      />

      {/* ─── Form Steps ─── */}
      {activeFormStep && (
        <Card
          title={<Space><SolutionOutlined /> {activeFormStep.title}</Space>}
          style={{ borderRadius: 12 }}
        >
          {activeFormStep.description && (
            <Alert
              message={activeFormStep.description}
              type="info"
              showIcon
              style={{ marginBottom: 20 }}
            />
          )}
          <Form
            form={formInstance}
            layout="vertical"
            initialValues={formAnswers}
            onValuesChange={(_changed, all) => { scheduleAutoSave(all as Record<string, unknown>); }}
          >
            {activeFormStep.fields.map((field) => (
              <Form.Item
                key={field.key}
                name={field.key}
                label={field.label}
                rules={field.required ? [{ required: true, message: `${field.label} is required` }] : undefined}
                tooltip={field.description}
                valuePropName={field.widget === 'checkbox' ? 'checked' : 'value'}
              >
                {renderField(field)}
              </Form.Item>
            ))}
          </Form>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
            <Button
              onClick={handleFormStepBack}
              disabled={currentStep === 0}
            >
              Back
            </Button>
            <Button type="primary" size="large" onClick={handleFormStepNext}>
              {currentStep === totalFormSteps - 1 ? 'Continue to Personal Details' : 'Next'}
            </Button>
          </div>
        </Card>
      )}

      {/* ─── Personal Details ─── */}
      {currentStep === personalDetailsStepIdx && (
        <Card
          title={<Space><UserOutlined /> Your Personal Details</Space>}
          style={{ borderRadius: 12 }}
        >
          <Alert
            message="We need these details for your tax filing. They'll also be used to contact you about your order."
            type="info"
            showIcon
            style={{ marginBottom: 20 }}
          />
          <Form form={personalForm} layout="vertical" initialValues={personalDetails}>
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item name="firstName" label="First Name" rules={[{ required: true, message: 'First name is required' }]}>
                  <Input size="large" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="lastName" label="Last Name" rules={[{ required: true, message: 'Last name is required' }]}>
                  <Input size="large" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Enter a valid email' }]}>
              <Input type="email" size="large" />
            </Form.Item>
            <Form.Item name="mobile" label="Mobile Number">
              <Input placeholder="+61..." size="large" />
            </Form.Item>
          </Form>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
            <Button onClick={() => { setCurrentStep(personalDetailsStepIdx - 1); }}>Back</Button>
            <Button type="primary" size="large" onClick={handlePersonalNext}>
              Continue to Review
            </Button>
          </div>
        </Card>
      )}

      {/* ─── Review & Submit ─── */}
      {currentStep === reviewStepIdx && (
        <Card title={<Space><CheckCircleOutlined /> Review Your Submission</Space>} style={{ borderRadius: 12 }}>
          <Card size="small" type="inner" title="Service" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Text strong>{selectedMapping.serviceTitle}</Text>
                <br />
                <Text type="secondary">FY {selectedMapping.financialYear}</Text>
              </div>
              <Text strong style={{ fontSize: 18, color: t.colorPrimary }}>
                {formatCurrency(selectedMapping.servicePrice)}
              </Text>
            </div>
          </Card>

          <Card size="small" type="inner" title="Personal Details" style={{ marginBottom: 16 }}>
            <Text strong>{personalDetails.firstName} {personalDetails.lastName}</Text>
            {personalDetails.email && <><br /><Text type="secondary">{personalDetails.email}</Text></>}
            {personalDetails.mobile && <><br /><Text type="secondary">{personalDetails.mobile}</Text></>}
          </Card>

          <Card size="small" type="inner" title="Your Answers" style={{ marginBottom: 16 }}>
            {parsedForm.steps.map((step) => (
              <div key={step.id} style={{ marginBottom: 12 }}>
                <Text strong style={{ color: t.colorPrimary, fontSize: 13 }}>{step.title}</Text>
                {step.fields.map((field) => {
                  const val = formAnswers[field.key];
                  if (val === undefined || val === null || val === '') return null;
                  return (
                    <div key={field.key} style={{ marginLeft: 8, marginTop: 4, fontSize: 13 }}>
                      <Text type="secondary">{field.label}: </Text>
                      <Text>{Array.isArray(val) ? val.join(', ') : String(val)}</Text>
                    </div>
                  );
                })}
              </div>
            ))}
          </Card>

          <Card size="small" type="inner" title="Discounts & Credits" style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>Promo Code</Text>
            <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
              <Input
                placeholder="Enter promo code"
                value={promoCode}
                onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoResult(null); }}
                style={{ textTransform: 'uppercase' }}
              />
              <Button onClick={handleValidatePromo} loading={validatePromoMutation.isPending} disabled={!promoCode.trim()}>
                Apply
              </Button>
            </Space.Compact>
            {promoResult && (
              <Text
                type={promoResult.valid ? 'success' : 'danger'}
                style={{ display: 'block', marginBottom: 12, fontSize: 12 }}
              >
                {promoResult.valid
                  ? `Discount applied: -${formatCurrency(promoResult.calculatedDiscount)}`
                  : promoResult.message}
              </Text>
            )}
            {(creditData?.balance ?? 0) > 0 && (
              <div>
                <Checkbox checked={useCredits} onChange={(e) => { setUseCredits(e.target.checked); }}>
                  Use credit balance ({formatCurrency(creditData?.balance ?? 0)} available)
                </Checkbox>
              </div>
            )}
          </Card>

          <Card
            size="small"
            type="inner"
            title="Price Summary"
            style={{
              marginBottom: 24,
              backgroundColor: t.colorFillAlter,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text>Subtotal</Text>
              <Text>{formatCurrency(pricing.subtotal)}</Text>
            </div>
            {pricing.discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text type="success">Promo Discount</Text>
                <Text type="success">-{formatCurrency(pricing.discount)}</Text>
              </div>
            )}
            {pricing.creditUsed > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text type="success">Credits Applied</Text>
                <Text type="success">-{formatCurrency(pricing.creditUsed)}</Text>
              </div>
            )}
            <Divider style={{ margin: '8px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text strong style={{ fontSize: 16 }}>Total</Text>
              <Text strong style={{ fontSize: 20, color: t.colorPrimary }}>
                {formatCurrency(pricing.total)}
              </Text>
            </div>
          </Card>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button onClick={() => { setCurrentStep(personalDetailsStepIdx); }}>Back</Button>
            <Button type="primary" size="large" onClick={handleSubmit} loading={submitMutation.isPending} icon={<RocketOutlined />}>
              Submit Tax Filing
            </Button>
          </div>
        </Card>
      )}

      {/* ─── Done ─── */}
      {currentStep === doneStepIdx && submittedOrder && (
        <Card style={{ borderRadius: 12, textAlign: 'center' }}>
          <Result
            status="success"
            title="Tax Filing Submitted!"
            subTitle={
              <span>
                Order <Text strong>{submittedOrder.orderNumber}</Text> is now under review.<br />
                Our team will reach out if anything else is needed.
              </span>
            }
            extra={[
              <Button type="primary" key="orders" size="large" onClick={() => { router.push(`/orders/${submittedOrder.orderId}`); }}>
                View Order
              </Button>,
              <Button key="appointment" size="large" onClick={() => { router.push('/appointments'); }}>
                Book Appointment
              </Button>,
              <Button key="home" size="large" onClick={() => { router.push('/'); }}>
                Dashboard
              </Button>,
            ]}
          />
        </Card>
      )}
    </div>
  );
}
