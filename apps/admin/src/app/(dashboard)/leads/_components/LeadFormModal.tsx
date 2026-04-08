'use client';

import { useEffect } from 'react';
import { Modal, Form, Input, Select, Radio, Row, Col, App } from 'antd';
import { useCreateLead, useUpdateLead } from '@/hooks/useLeads';
import { LEAD_SOURCES, LEAD_SOURCE_LABELS } from '@/types/lead';
import type { Lead } from '@/types/lead';
import { AU_STATES, getFinancialYears } from '@/lib/utils/constants';

interface LeadFormModalProps {
  open: boolean;
  onClose: () => void;
  lead?: Lead;
}

export function LeadFormModal({ open, onClose, lead }: LeadFormModalProps): React.ReactNode {
  const [form] = Form.useForm();
  const createMutation = useCreateLead();
  const updateMutation = useUpdateLead();
  const { message } = App.useApp();
  const isEdit = !!lead;

  useEffect(() => {
    if (open && lead) {
      form.setFieldsValue(lead);
    } else if (open) {
      form.resetFields();
    }
  }, [open, lead, form]);

  const handleSubmit = async (): Promise<void> => {
    const values = await form.validateFields();
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: lead._id, data: values });
        message.success('Lead updated');
      } else {
        await createMutation.mutateAsync(values);
        message.success('Lead created');
      }
      onClose();
    } catch {
      message.error(isEdit ? 'Failed to update lead' : 'Failed to create lead');
    }
  };

  const sourceOptions = LEAD_SOURCES.map((s) => ({ value: s, label: LEAD_SOURCE_LABELS[s] }));

  return (
    <Modal
      title={isEdit ? 'Edit Lead' : 'New Lead'}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={createMutation.isPending || updateMutation.isPending}
      width={640}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="firstName" label="First Name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="lastName" label="Last Name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="mobile" label="Mobile" rules={[{ required: true }]}>
              <Input placeholder="+61412345678" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="source" label="Source" rules={[{ required: true }]}>
              <Select options={sourceOptions} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="priority" label="Priority" initialValue="warm">
              <Radio.Group>
                <Radio.Button value="hot">Hot</Radio.Button>
                <Radio.Button value="warm">Warm</Radio.Button>
                <Radio.Button value="cold">Cold</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="state" label="State">
              <Select options={AU_STATES} allowClear />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="financialYear" label="Financial Year">
              <Select
                options={getFinancialYears().map((y) => ({ value: y, label: y }))}
                allowClear
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
