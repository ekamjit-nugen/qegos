'use client';

import { Alert, Card, Empty, Space, Tag, Typography } from 'antd';

const { Text } = Typography;

interface PreviewPaneProps {
  schema: Record<string, unknown> | null;
}

interface FieldRow {
  key: string;
  title: string;
  type: string;
  widget: string;
  required: boolean;
}

interface StepRow {
  id: string;
  title: string;
  fields: FieldRow[];
}

function extractSteps(schema: Record<string, unknown> | null): StepRow[] {
  if (!schema || typeof schema !== 'object') return [];
  const xq = (schema['x-qegos'] as Record<string, unknown> | undefined) ?? {};
  const stepIds = Array.isArray(xq.steps) ? (xq.steps as string[]) : [];
  const props = (schema.properties as Record<string, unknown> | undefined) ?? {};

  const result: StepRow[] = [];
  for (const stepId of stepIds) {
    const step = props[stepId] as Record<string, unknown> | undefined;
    if (!step || typeof step !== 'object') continue;
    const stepProps = (step.properties as Record<string, unknown> | undefined) ?? {};
    const required = Array.isArray(step.required) ? (step.required as string[]) : [];
    const fields: FieldRow[] = Object.entries(stepProps).map(([key, raw]) => {
      const f = raw as Record<string, unknown>;
      const xqf = (f['x-qegos'] as Record<string, unknown> | undefined) ?? {};
      return {
        key: (xqf.fieldKey as string) ?? key,
        title: (f.title as string) ?? key,
        type: (f.type as string) ?? '—',
        widget: (xqf.widget as string) ?? '—',
        required: required.includes(key),
      };
    });
    result.push({
      id: stepId,
      title: (step.title as string) ?? stepId,
      fields,
    });
  }
  return result;
}

export function PreviewPane({ schema }: PreviewPaneProps): React.ReactNode {
  const steps = extractSteps(schema);

  return (
    <div>
      <Alert
        message="Preview (Phase 1a)"
        description="A rendered stepper preview lands in Phase 1c with the shared form renderer. This view lists every step + field key + widget so you can eyeball the authored structure."
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
      />
      {steps.length === 0 ? (
        <Empty description="No steps found in schema" />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {steps.map((step, idx) => (
            <Card
              key={step.id}
              size="small"
              title={
                <span>
                  <Tag color="blue">{idx + 1}</Tag>
                  {step.title}{' '}
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    ({step.id})
                  </Text>
                </span>
              }
            >
              {step.fields.length === 0 ? (
                <Text type="secondary">No fields</Text>
              ) : (
                <table style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>
                      <th style={{ padding: '4px 8px' }}>Field Key</th>
                      <th style={{ padding: '4px 8px' }}>Label</th>
                      <th style={{ padding: '4px 8px' }}>Type</th>
                      <th style={{ padding: '4px 8px' }}>Widget</th>
                      <th style={{ padding: '4px 8px' }}>Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {step.fields.map((f) => (
                      <tr key={f.key} style={{ borderBottom: '1px solid #fafafa' }}>
                        <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{f.key}</td>
                        <td style={{ padding: '4px 8px' }}>{f.title}</td>
                        <td style={{ padding: '4px 8px' }}>{f.type}</td>
                        <td style={{ padding: '4px 8px' }}>
                          <Tag>{f.widget}</Tag>
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          {f.required ? <Tag color="red">req</Tag> : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          ))}
        </Space>
      )}
    </div>
  );
}
