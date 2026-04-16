'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Space,
  Steps,
  Typography,
  Upload,
} from 'antd';
import { InboxOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface PreviewPaneProps {
  schema: Record<string, unknown> | null;
}

interface FieldNode {
  key: string;
  title: string;
  description?: string;
  type: string;
  widget: string;
  placeholder?: string;
  required: boolean;
  enumValues?: Array<{ value: string | number; label: string }>;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  // Nested object (one level deep — e.g. rentalProperty)
  children?: FieldNode[];
}

interface StepNode {
  id: string;
  title: string;
  description?: string;
  fields: FieldNode[];
}

function asObject(val: unknown): Record<string, unknown> | undefined {
  return val && typeof val === 'object' && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : undefined;
}

function buildEnumOptions(
  enumRaw: unknown,
  enumNamesRaw: unknown,
): Array<{ value: string | number; label: string }> | undefined {
  if (!Array.isArray(enumRaw) || enumRaw.length === 0) return undefined;
  const names = Array.isArray(enumNamesRaw) ? (enumNamesRaw as string[]) : [];
  return enumRaw.map((value, idx) => ({
    value: value as string | number,
    label: names[idx] ?? String(value),
  }));
}

function extractField(key: string, raw: unknown, isRequired: boolean): FieldNode | null {
  const f = asObject(raw);
  if (!f) return null;
  const xq = asObject(f['x-qegos']) ?? {};
  const type = (f.type as string) ?? 'string';
  const widget = (xq.widget as string) ?? type;
  const fieldKey = (xq.fieldKey as string) ?? key;

  // Nested object — recurse one level so groups like "rentalProperty" render as a fieldset
  if (type === 'object' && asObject(f.properties)) {
    const nestedProps = asObject(f.properties) ?? {};
    const nestedRequired = Array.isArray(f.required) ? (f.required as string[]) : [];
    const children: FieldNode[] = [];
    for (const [ck, cv] of Object.entries(nestedProps)) {
      const child = extractField(ck, cv, nestedRequired.includes(ck));
      if (child) children.push(child);
    }
    return {
      key: fieldKey,
      title: (f.title as string) ?? key,
      description: f.description as string | undefined,
      type,
      widget: 'group',
      required: isRequired,
      children,
    };
  }

  return {
    key: fieldKey,
    title: (f.title as string) ?? key,
    description: f.description as string | undefined,
    type,
    widget,
    placeholder: xq.placeholder as string | undefined,
    required: isRequired,
    enumValues: buildEnumOptions(f.enum, xq.enumNames),
    minimum: typeof f.minimum === 'number' ? f.minimum : undefined,
    maximum: typeof f.maximum === 'number' ? f.maximum : undefined,
    maxLength: typeof f.maxLength === 'number' ? f.maxLength : undefined,
  };
}

function extractSteps(schema: Record<string, unknown> | null): StepNode[] {
  if (!schema) return [];
  const xq = asObject(schema['x-qegos']) ?? {};
  const stepIds = Array.isArray(xq.steps) ? (xq.steps as string[]) : [];
  const props = asObject(schema.properties) ?? {};

  const result: StepNode[] = [];
  for (const stepId of stepIds) {
    const step = asObject(props[stepId]);
    if (!step) continue;
    const stepProps = asObject(step.properties) ?? {};
    const required = Array.isArray(step.required) ? (step.required as string[]) : [];
    const stepXq = asObject(step['x-qegos']) ?? {};
    const fields: FieldNode[] = [];
    for (const [k, v] of Object.entries(stepProps)) {
      const fld = extractField(k, v, required.includes(k));
      if (fld) fields.push(fld);
    }
    result.push({
      id: stepId,
      title: (step.title as string) ?? stepId,
      description: (stepXq.description as string) ?? (step.description as string | undefined),
      fields,
    });
  }
  return result;
}

function renderWidget(field: FieldNode): React.ReactNode {
  const placeholder = field.placeholder ?? `Enter ${field.title.toLowerCase()}`;
  switch (field.widget) {
    case 'textarea':
      return <Input.TextArea rows={3} placeholder={placeholder} maxLength={field.maxLength} />;
    case 'number':
      return (
        <InputNumber
          style={{ width: '100%' }}
          placeholder={placeholder}
          min={field.minimum}
          max={field.maximum}
        />
      );
    case 'currency':
      return (
        <InputNumber
          style={{ width: '100%' }}
          placeholder={placeholder}
          prefix="$"
          min={field.minimum}
          max={field.maximum}
        />
      );
    case 'date':
      return <DatePicker style={{ width: '100%' }} placeholder={placeholder} />;
    case 'select':
      return <Select placeholder={placeholder} options={field.enumValues} allowClear />;
    case 'multi_select':
      return (
        <Select mode="multiple" placeholder={placeholder} options={field.enumValues} allowClear />
      );
    case 'radio':
      return (
        <Radio.Group>
          {field.enumValues?.map((opt) => (
            <Radio key={String(opt.value)} value={opt.value}>
              {opt.label}
            </Radio>
          ))}
        </Radio.Group>
      );
    case 'checkbox':
      return <Checkbox>{field.title}</Checkbox>;
    case 'file_upload':
      return (
        <Upload.Dragger disabled multiple={false}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text" style={{ fontSize: 12 }}>
            File upload (Phase 1c — wiring deferred)
          </p>
        </Upload.Dragger>
      );
    case 'text':
    default:
      return <Input placeholder={placeholder} maxLength={field.maxLength} />;
  }
}

function FieldItem({ field }: { field: FieldNode }): React.ReactNode {
  if (field.widget === 'group' && field.children) {
    return (
      <div
        style={{
          padding: 12,
          border: '1px dashed #d9d9d9',
          borderRadius: 6,
          marginBottom: 16,
        }}
      >
        <div style={{ marginBottom: 8, fontWeight: 500 }}>{field.title}</div>
        {field.description && (
          <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
            {field.description}
          </Text>
        )}
        {field.children.map((child) => (
          <FieldItem key={child.key} field={child} />
        ))}
      </div>
    );
  }

  if (field.widget === 'checkbox') {
    return (
      <Form.Item
        name={field.key}
        valuePropName="checked"
        required={field.required}
        extra={field.description}
      >
        {renderWidget(field)}
      </Form.Item>
    );
  }

  return (
    <Form.Item
      name={field.key}
      label={field.title}
      required={field.required}
      extra={field.description}
    >
      {renderWidget(field)}
    </Form.Item>
  );
}

export function PreviewPane({ schema }: PreviewPaneProps): React.ReactNode {
  const steps = useMemo(() => extractSteps(schema), [schema]);
  const [current, setCurrent] = useState(0);

  // Clamp current step when schema/steps change
  useEffect(() => {
    if (current >= steps.length && steps.length > 0) {
      setCurrent(0);
    }
  }, [steps.length, current]);

  if (!schema) {
    return <Empty description="No schema yet — start typing in the editor" />;
  }
  if (steps.length === 0) {
    return (
      <Alert
        type="warning"
        showIcon
        message="No steps found"
        description={
          <span>
            The schema must declare <code>x-qegos.steps</code> and a matching object under{' '}
            <code>properties</code> for each step ID.
          </span>
        }
      />
    );
  }

  const activeStep = steps[Math.min(current, steps.length - 1)];

  return (
    <div>
      <Steps
        size="small"
        current={current}
        onChange={setCurrent}
        items={steps.map((s) => ({ title: s.title }))}
        style={{ marginBottom: 16 }}
      />

      {activeStep.description && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          {activeStep.description}
        </Text>
      )}

      {activeStep.fields.length === 0 ? (
        <Empty description="This step has no fields" />
      ) : (
        <Form layout="vertical" disabled>
          {activeStep.fields.map((field) => (
            <FieldItem key={field.key} field={field} />
          ))}
        </Form>
      )}

      <Space style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <Button
          size="small"
          icon={<LeftOutlined />}
          disabled={current === 0}
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
        >
          Previous
        </Button>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Step {current + 1} of {steps.length}
        </Text>
        <Button
          size="small"
          icon={<RightOutlined />}
          iconPosition="end"
          disabled={current >= steps.length - 1}
          onClick={() => setCurrent((c) => Math.min(steps.length - 1, c + 1))}
        >
          Next
        </Button>
      </Space>
    </div>
  );
}
