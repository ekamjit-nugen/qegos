'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Col, Form, Input, Row, Select, Typography, message } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useCreateFormMapping } from '@/hooks/useFormMappings';
import { useSalesList } from '@/hooks/useSales';
import { isValidFinancialYear, type FormMappingSchema } from '@/types/formMapping';
import { JsonEditor } from './JsonEditor';

const { Title, Text } = Typography;

const MINIMAL_TEMPLATE = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  title: 'New Form Mapping',
  description: 'Authored intake form',
  'x-qegos': { steps: ['personal_details'] },
  properties: {
    personal_details: {
      type: 'object',
      title: 'Personal Details',
      'x-qegos': { stepId: 'personal_details' },
      properties: {
        first_name: {
          type: 'string',
          title: 'First Name',
          minLength: 1,
          maxLength: 100,
          'x-qegos': { fieldKey: 'first_name', widget: 'text' },
        },
        last_name: {
          type: 'string',
          title: 'Last Name',
          minLength: 1,
          maxLength: 100,
          'x-qegos': { fieldKey: 'last_name', widget: 'text' },
        },
        email: {
          type: 'string',
          title: 'Email',
          format: 'email',
          'x-qegos': { fieldKey: 'email', widget: 'text' },
        },
      },
      required: ['first_name', 'last_name', 'email'],
    },
  },
  required: ['personal_details'],
};

function extractErr(e: unknown): string {
  const err = e as {
    response?: { data?: { message?: string; errors?: Array<{ message: string }> } };
    message?: string;
  };
  const base = err.response?.data?.message ?? err.message ?? 'Request failed';
  const details = err.response?.data?.errors?.map((x) => x.message).join('; ');
  return details ? `${base}: ${details}` : base;
}

interface FormValues {
  salesItemId: string;
  financialYear: string;
  title: string;
  description?: string;
}

export function FormMappingCreatePage(): React.ReactNode {
  const router = useRouter();
  const [form] = Form.useForm<FormValues>();
  const { data: salesItems } = useSalesList();
  const create = useCreateFormMapping();

  const [jsonText, setJsonText] = useState(() => JSON.stringify(MINIMAL_TEMPLATE, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleSubmit = async (values: FormValues): Promise<void> => {
    let schema: FormMappingSchema;
    try {
      schema = JSON.parse(jsonText) as FormMappingSchema;
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'Invalid JSON');
      return;
    }
    setJsonError(null);

    try {
      const result = await create.mutateAsync({
        salesItemId: values.salesItemId,
        financialYear: values.financialYear,
        title: values.title,
        description: values.description,
        schema,
      });
      message.success('Mapping created — draft v1 ready to edit');
      router.push(`/form-mappings/${result.mapping._id}/versions/${result.version.version}`);
    } catch (e) {
      message.error(extractErr(e));
    }
  };

  const salesOptions = (salesItems ?? [])
    .filter((s) => s.isActive)
    .map((s) => ({ value: s._id, label: s.title }));

  // FY options: current + next 2
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const fyOptions = [`${year}-${year + 1}`, `${year + 1}-${year + 2}`, `${year - 1}-${year}`].map(
    (v) => ({ value: v, label: v }),
  );

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/form-mappings')}>
          Back
        </Button>
        <Title level={3} style={{ margin: 0 }}>
          New Form Mapping
        </Title>
      </div>

      <Alert
        type="info"
        showIcon
        message="Creating a mapping creates a draft v1 automatically. You can edit and publish it from the version editor."
        style={{ marginBottom: 16 }}
      />

      <Form<FormValues> form={form} layout="vertical" onFinish={handleSubmit}>
        <Card style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Sales Item"
                name="salesItemId"
                rules={[{ required: true, message: 'Select a sales item' }]}
              >
                <Select
                  placeholder="Select sales item"
                  options={salesOptions}
                  showSearch
                  optionFilterProp="label"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Financial Year"
                name="financialYear"
                rules={[
                  { required: true, message: 'Required' },
                  {
                    validator: (_, v) =>
                      !v || isValidFinancialYear(v)
                        ? Promise.resolve()
                        : Promise.reject(new Error('Must be YYYY-YYYY (e.g. 2025-2026)')),
                  },
                ]}
              >
                <Select placeholder="2025-2026" options={fyOptions} showSearch allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Title" name="title" rules={[{ required: true, min: 3, max: 200 }]}>
                <Input placeholder="Student Tax Return Intake 2026" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Description" name="description">
                <Input placeholder="Optional" />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Card
          size="small"
          title="Initial Schema"
          extra={<Text type="secondary">A minimal starter template is pre-filled.</Text>}
          style={{ marginBottom: 16 }}
          styles={{ body: { padding: 0 } }}
        >
          <JsonEditor value={jsonText} onChange={setJsonText} height={500} />
        </Card>

        {jsonError && (
          <Alert
            type="error"
            showIcon
            message="Invalid JSON"
            description={jsonError}
            style={{ marginBottom: 16 }}
          />
        )}

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={create.isPending}>
            Create Mapping
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
