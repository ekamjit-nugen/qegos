'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Radio,
  Result,
  Select,
  Spin,
  Steps,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  FileTextOutlined,
  UserOutlined,
  SolutionOutlined,
  SmileOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/lib/auth/useAuth';
import { useAvailableFormMappings, useSubmitFormFill } from '@/hooks/useFormFill';
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

function parseSchemaFields(schema: Record<string, unknown>): ParsedField[] {
  const properties = (schema.properties ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const requiredFields = (schema.required ?? []) as string[];
  const fields: ParsedField[] = [];

  for (const [key, prop] of Object.entries(properties)) {
    const xQegos = (prop['x-qegos'] ?? {}) as Record<string, unknown>;
    const widget = (xQegos.widget ?? guessWidget(prop)) as FormMappingWidget;
    const field: ParsedField = {
      key,
      label: (prop.title ?? key) as string,
      widget,
      required: requiredFields.includes(key),
      description: prop.description as string | undefined,
      placeholder: xQegos.placeholder as string | undefined,
      step: xQegos.step as string | undefined,
    };

    // Extract options for select/radio/multi_select
    if (prop.enum && Array.isArray(prop.enum)) {
      const labels = (xQegos.enumLabels ?? prop.enum) as string[];
      field.options = (prop.enum as string[]).map((val, i) => ({
        label: labels[i] ?? val,
        value: val,
      }));
    }

    // oneOf pattern for options
    if (prop.oneOf && Array.isArray(prop.oneOf)) {
      field.options = (prop.oneOf as Array<{ const: string; title: string }>).map(
        (item) => ({
          label: item.title ?? String(item.const),
          value: String(item.const),
        }),
      );
    }

    fields.push(field);
  }

  return fields;
}

function guessWidget(prop: Record<string, unknown>): FormMappingWidget {
  if (prop.type === 'boolean') return 'checkbox';
  if (prop.type === 'number' || prop.type === 'integer') return 'number';
  if (prop.format === 'date') return 'date';
  if (prop.enum) return 'select';
  return 'text';
}

// ─── Field Renderer ────────────────────────────────────────────────────────

function renderField(field: ParsedField): React.ReactNode {
  switch (field.widget) {
    case 'text':
      return <Input placeholder={field.placeholder} />;
    case 'textarea':
      return <Input.TextArea placeholder={field.placeholder} rows={3} />;
    case 'number':
      return <InputNumber style={{ width: '100%' }} placeholder={field.placeholder} />;
    case 'currency':
      return (
        <InputNumber
          prefix="$"
          style={{ width: '100%' }}
          min={0}
          precision={2}
          placeholder={field.placeholder}
        />
      );
    case 'date':
      return <DatePicker style={{ width: '100%' }} />;
    case 'select':
      return (
        <Select
          placeholder={field.placeholder ?? 'Select an option'}
          options={field.options}
          allowClear
        />
      );
    case 'radio':
      return (
        <Radio.Group>
          {field.options?.map((opt) => (
            <Radio key={opt.value} value={opt.value}>
              {opt.label}
            </Radio>
          ))}
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
        />
      );
    case 'file_upload':
      return <Input type="file" />;
    default:
      return <Input placeholder={field.placeholder} />;
  }
}

// ─── Component ─────────────────────────────────────────────────────────────

const STEPS = [
  { title: 'Select Service', icon: <FileTextOutlined /> },
  { title: 'Fill Form', icon: <SolutionOutlined /> },
  { title: 'Personal Details', icon: <UserOutlined /> },
  { title: 'Review & Submit', icon: <CheckCircleOutlined /> },
  { title: 'Done', icon: <SmileOutlined /> },
];

export function FileTaxPage(): React.ReactNode {
  const router = useRouter();
  const { user } = useAuth();
  const { data: mappings, isLoading } = useAvailableFormMappings();
  const submitMutation = useSubmitFormFill();
  const { data: creditData } = useCreditBalance();
  const validatePromoMutation = useValidatePromoCode();

  const [currentStep, setCurrentStep] = useState(0);
  const [selectedMapping, setSelectedMapping] = useState<AvailableFormMapping | null>(null);
  const [formAnswers, setFormAnswers] = useState<Record<string, unknown>>({});
  const [promoCode, setPromoCode] = useState('');
  const [promoResult, setPromoResult] = useState<PromoCodeValidationResult | null>(null);
  const [useCredits, setUseCredits] = useState(false);
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
  const [submittedOrder, setSubmittedOrder] = useState<{
    orderId: string;
    orderNumber: string;
  } | null>(null);

  const [formInstance] = Form.useForm();
  const [personalForm] = Form.useForm();

  // Parse schema fields
  const schemaFields = useMemo(() => {
    if (!selectedMapping) return [];
    return parseSchemaFields(selectedMapping.schema as Record<string, unknown>);
  }, [selectedMapping]);

  // Step 0: Select service
  const handleSelectMapping = useCallback(
    (mapping: AvailableFormMapping) => {
      setSelectedMapping(mapping);
      setCurrentStep(1);
    },
    [],
  );

  // Step 1: Fill form → Step 2
  const handleFormNext = useCallback(() => {
    formInstance
      .validateFields()
      .then((values: Record<string, unknown>) => {
        setFormAnswers(values);
        // Pre-fill personal details from user profile
        personalForm.setFieldsValue({
          firstName: user?.firstName ?? '',
          lastName: user?.lastName ?? '',
          email: user?.email ?? '',
          mobile: '',
        });
        setCurrentStep(2);
      })
      .catch(() => {
        void message.warning('Please fill in all required fields');
      });
  }, [formInstance, personalForm, user]);

  // Step 2: Personal details → Step 3
  const handlePersonalNext = useCallback(() => {
    personalForm
      .validateFields()
      .then((values: { firstName: string; lastName: string; email?: string; mobile?: string }) => {
        setPersonalDetails(values);
        setCurrentStep(3);
      })
      .catch(() => {
        void message.warning('Please fill in all required fields');
      });
  }, [personalForm]);

  // Validate promo code
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
            void message.success(`Promo code applied! Discount: ${formatCurrency(result.calculatedDiscount)}`);
          }
        },
        onError: () => {
          void message.error('Failed to validate promo code');
        },
      },
    );
  }, [promoCode, selectedMapping, validatePromoMutation]);

  // Computed pricing
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

  // Step 3: Submit
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
      },
      {
        onSuccess: (result) => {
          setSubmittedOrder({
            orderId: result.orderId,
            orderNumber: result.orderNumber,
          });
          setCurrentStep(4);
        },
        onError: () => {
          void message.error('Failed to submit form. Please try again.');
        },
      },
    );
  }, [selectedMapping, personalDetails, formAnswers, submitMutation, promoCode, promoResult, useCredits, pricing]);

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Title level={3}>File Your Tax Return</Title>

      <Steps
        current={currentStep}
        items={STEPS}
        style={{ marginBottom: 32 }}
        size="small"
      />

      {/* Step 0: Select Service */}
      {currentStep === 0 && (
        <div>
          <Paragraph type="secondary">
            Select the tax service you would like to file for.
          </Paragraph>
          {!mappings || mappings.length === 0 ? (
            <Empty description="No tax forms are currently available. Please check back later." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {mappings.map((mapping) => (
                <Card
                  key={mapping.mappingId}
                  hoverable
                  onClick={() => { handleSelectMapping(mapping); }}
                  style={{ cursor: 'pointer' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <Text strong style={{ fontSize: 16 }}>
                        {mapping.serviceTitle}
                      </Text>
                      <br />
                      <Text type="secondary">
                        {mapping.title} &middot; FY {mapping.financialYear}
                      </Text>
                      {mapping.description && (
                        <>
                          <br />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {mapping.description}
                          </Text>
                        </>
                      )}
                    </div>
                    <Text strong style={{ fontSize: 18, color: '#1677ff' }}>
                      {formatCurrency(mapping.servicePrice)}
                    </Text>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 1: Fill Form */}
      {currentStep === 1 && selectedMapping && (
        <Card title={selectedMapping.title}>
          <Form form={formInstance} layout="vertical" initialValues={formAnswers}>
            {schemaFields.map((field) => (
              <Form.Item
                key={field.key}
                name={field.key}
                label={field.label}
                rules={
                  field.required
                    ? [{ required: true, message: `${field.label} is required` }]
                    : undefined
                }
                tooltip={field.description}
                valuePropName={field.widget === 'checkbox' ? 'checked' : 'value'}
              >
                {renderField(field)}
              </Form.Item>
            ))}
          </Form>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
            <Button onClick={() => { setCurrentStep(0); }}>Back</Button>
            <Button type="primary" onClick={handleFormNext}>
              Next
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: Personal Details */}
      {currentStep === 2 && (
        <Card title="Your Personal Details">
          <Form form={personalForm} layout="vertical" initialValues={personalDetails}>
            <Form.Item
              name="firstName"
              label="First Name"
              rules={[{ required: true, message: 'First name is required' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="lastName"
              label="Last Name"
              rules={[{ required: true, message: 'Last name is required' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="email"
              label="Email"
              rules={[{ type: 'email', message: 'Enter a valid email' }]}
            >
              <Input type="email" />
            </Form.Item>
            <Form.Item name="mobile" label="Mobile">
              <Input placeholder="+61..." />
            </Form.Item>
          </Form>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
            <Button onClick={() => { setCurrentStep(1); }}>Back</Button>
            <Button type="primary" onClick={handlePersonalNext}>
              Next
            </Button>
          </div>
        </Card>
      )}

      {/* Step 3: Review & Submit */}
      {currentStep === 3 && selectedMapping && (
        <Card title="Review Your Submission">
          <div style={{ marginBottom: 16 }}>
            <Text strong>Service: </Text>
            <Text>{selectedMapping.serviceTitle}</Text>
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text strong>Financial Year: </Text>
            <Text>{selectedMapping.financialYear}</Text>
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text strong>Name: </Text>
            <Text>
              {personalDetails.firstName} {personalDetails.lastName}
            </Text>
          </div>
          {personalDetails.email && (
            <div style={{ marginBottom: 16 }}>
              <Text strong>Email: </Text>
              <Text>{personalDetails.email}</Text>
            </div>
          )}

          <Card
            title="Form Answers"
            size="small"
            style={{ marginTop: 16, marginBottom: 16 }}
          >
            {schemaFields.map((field) => {
              const val = formAnswers[field.key];
              if (val === undefined || val === null || val === '') return null;
              return (
                <div key={field.key} style={{ marginBottom: 8 }}>
                  <Text strong>{field.label}: </Text>
                  <Text>{String(val)}</Text>
                </div>
              );
            })}
          </Card>

          {/* Promo Code & Credits */}
          <Card title="Discounts & Credits" size="small" style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <Text strong style={{ display: 'block', marginBottom: 4 }}>Promo Code</Text>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  placeholder="Enter promo code"
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value.toUpperCase());
                    setPromoResult(null);
                  }}
                  style={{ flex: 1, textTransform: 'uppercase' }}
                />
                <Button
                  onClick={handleValidatePromo}
                  loading={validatePromoMutation.isPending}
                  disabled={!promoCode.trim()}
                >
                  Apply
                </Button>
              </div>
              {promoResult && (
                <Text
                  type={promoResult.valid ? 'success' : 'danger'}
                  style={{ display: 'block', marginTop: 4 }}
                >
                  {promoResult.valid
                    ? `Discount: -${formatCurrency(promoResult.calculatedDiscount)}`
                    : promoResult.message}
                </Text>
              )}
            </div>

            {(creditData?.balance ?? 0) > 0 && (
              <div>
                <Checkbox
                  checked={useCredits}
                  onChange={(e) => setUseCredits(e.target.checked)}
                >
                  Use credit balance ({formatCurrency(creditData?.balance ?? 0)} available)
                </Checkbox>
                {useCredits && pricing.creditUsed > 0 && (
                  <Text type="success" style={{ display: 'block', marginTop: 4 }}>
                    Credit applied: -{formatCurrency(pricing.creditUsed)}
                  </Text>
                )}
              </div>
            )}
          </Card>

          {/* Price Summary */}
          <Card title="Price Summary" size="small" style={{ marginBottom: 24 }}>
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
                <Text type="success">Credit Applied</Text>
                <Text type="success">-{formatCurrency(pricing.creditUsed)}</Text>
              </div>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderTop: '1px solid #f0f0f0',
                paddingTop: 8,
                marginTop: 8,
              }}
            >
              <Text strong style={{ fontSize: 16 }}>Total</Text>
              <Text strong style={{ fontSize: 16, color: '#1677ff' }}>
                {formatCurrency(pricing.total)}
              </Text>
            </div>
          </Card>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button onClick={() => { setCurrentStep(2); }}>Back</Button>
            <Button
              type="primary"
              onClick={handleSubmit}
              loading={submitMutation.isPending}
            >
              Submit Tax Filing
            </Button>
          </div>
        </Card>
      )}

      {/* Step 4: Confirmation */}
      {currentStep === 4 && submittedOrder && (
        <Result
          status="success"
          title="Tax Filing Submitted Successfully!"
          subTitle={`Order ${submittedOrder.orderNumber} has been created. Our team will review your submission and get back to you.`}
          extra={[
            <Button
              type="primary"
              key="orders"
              onClick={() => { router.push(`/orders/${submittedOrder.orderId}`); }}
            >
              View Order
            </Button>,
            <Button
              key="appointment"
              onClick={() => { router.push('/appointments'); }}
            >
              Book Appointment
            </Button>,
            <Button
              key="home"
              onClick={() => { router.push('/'); }}
            >
              Go to Dashboard
            </Button>,
          ]}
        />
      )}
    </div>
  );
}
