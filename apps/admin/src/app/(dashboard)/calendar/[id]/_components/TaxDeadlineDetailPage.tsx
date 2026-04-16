'use client';

import { useEffect } from 'react';
import {
  Row,
  Col,
  Card,
  Descriptions,
  Tag,
  Spin,
  Empty,
  Form,
  Input,
  Select,
  Switch,
  Button,
  App,
} from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { DEADLINE_TYPE_LABELS } from '@/types/taxCalendar';
import { useTaxDeadline, useUpdateTaxDeadline } from '@/hooks/useTaxCalendar';
import { formatDate, formatDateTime } from '@/lib/utils/format';

const deadlineTypeOptions = Object.entries(DEADLINE_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export function TaxDeadlineDetailPage({ id }: { id: string }): React.ReactNode {
  const { data: deadline, isLoading } = useTaxDeadline(id);
  const updateDeadline = useUpdateTaxDeadline();
  const [form] = Form.useForm();
  const { message } = App.useApp();

  useEffect(() => {
    if (deadline) {
      form.setFieldsValue({
        title: deadline.title,
        description: deadline.description,
        deadlineDate: deadline.deadlineDate,
        type: deadline.type,
        applicableTo: deadline.applicableTo,
        financialYear: deadline.financialYear,
        isRecurring: deadline.isRecurring,
        isActive: deadline.isActive,
      });
    }
  }, [deadline, form]);

  if (isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }
  if (!deadline) {
    return <Empty description="Deadline not found" />;
  }

  const handleSubmit = async (): Promise<void> => {
    const values = await form.validateFields();
    try {
      await updateDeadline.mutateAsync({ id, data: values });
      message.success('Deadline updated');
    } catch {
      message.error('Failed to update deadline');
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0 }}>{deadline.title}</h2>
        <Tag>{DEADLINE_TYPE_LABELS[deadline.type] ?? deadline.type}</Tag>
      </div>

      <Row gutter={[16, 16]}>
        {/* Left column */}
        <Col xs={24} lg={16}>
          <Card title="Deadline Details" style={{ marginBottom: 16 }}>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="Title">{deadline.title}</Descriptions.Item>
              <Descriptions.Item label="Description">
                {deadline.description ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Deadline Date">
                {formatDate(deadline.deadlineDate)}
              </Descriptions.Item>
              <Descriptions.Item label="Type">
                {DEADLINE_TYPE_LABELS[deadline.type] ?? deadline.type}
              </Descriptions.Item>
              <Descriptions.Item label="Applicable To">{deadline.applicableTo}</Descriptions.Item>
              <Descriptions.Item label="Financial Year">{deadline.financialYear}</Descriptions.Item>
              <Descriptions.Item label="Recurring">
                <Tag color={deadline.isRecurring ? 'blue' : 'default'}>
                  {deadline.isRecurring ? 'Yes' : 'No'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Active">
                <Tag color={deadline.isActive ? 'green' : 'red'}>
                  {deadline.isActive ? 'Yes' : 'No'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Edit Deadline" style={{ marginBottom: 16 }}>
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="title"
                    label="Title"
                    rules={[{ required: true, message: 'Title is required' }]}
                  >
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="type"
                    label="Type"
                    rules={[{ required: true, message: 'Type is required' }]}
                  >
                    <Select options={deadlineTypeOptions} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="description" label="Description">
                <Input.TextArea rows={3} />
              </Form.Item>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="deadlineDate"
                    label="Deadline Date"
                    rules={[{ required: true, message: 'Date is required' }]}
                  >
                    <Input type="date" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="applicableTo" label="Applicable To">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item name="financialYear" label="Financial Year">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col xs={12}>
                  <Form.Item name="isRecurring" label="Recurring" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
                <Col xs={12}>
                  <Form.Item name="isActive" label="Active" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
              </Row>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={updateDeadline.isPending}
              >
                Save Changes
              </Button>
            </Form>
          </Card>
        </Col>

        {/* Right column */}
        <Col xs={24} lg={8}>
          <Card title="Status" style={{ marginBottom: 16 }}>
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <Tag
                color={deadline.isActive ? 'green' : 'red'}
                style={{ fontSize: 16, padding: '4px 16px' }}
              >
                {deadline.isActive ? 'Active' : 'Inactive'}
              </Tag>
            </div>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Notifications Sent">
                {deadline.notificationsSent ?? 0}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Timeline" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Created">
                {formatDateTime(deadline.createdAt)}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
