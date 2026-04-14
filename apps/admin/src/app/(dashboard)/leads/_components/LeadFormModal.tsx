'use client';

import { useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Select, Radio, Row, Col, App, Switch, Divider } from 'antd';
import { useCreateLead, useUpdateLead } from '@/hooks/useLeads';
import {
  LEAD_SOURCES, LEAD_SOURCE_LABELS,
  MARITAL_STATUSES, MARITAL_STATUS_LABELS,
  EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS,
  PREFERRED_LANGUAGES, PREFERRED_LANGUAGE_LABELS,
  PREFERRED_CONTACTS, PREFERRED_CONTACT_LABELS,
} from '@/types/lead';
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
      form.setFieldsValue({
        ...lead,
        // Convert cents to dollars for display
        estimatedValue: lead.estimatedValue != null ? lead.estimatedValue / 100 : undefined,
      });
    } else if (open) {
      form.resetFields();
    }
  }, [open, lead, form]);

  const handleSubmit = async (): Promise<void> => {
    const values = await form.validateFields();
    // Convert dollars to cents for estimatedValue
    if (values.estimatedValue != null) {
      values.estimatedValue = Math.round(values.estimatedValue * 100);
    }
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
      onOk={() => { void handleSubmit(); }}
      confirmLoading={createMutation.isPending || updateMutation.isPending}
      width={720}
      destroyOnClose
    >
      <Form form={form} layout="vertical" size="middle">
        {/* ─── Basic Info ──────────────────────────────────────────── */}
        <Divider orientation="left" style={{ fontSize: 13, margin: '0 0 16px' }}>Basic Information</Divider>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="firstName" label="First Name" rules={[{ required: true, message: 'Required' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="lastName" label="Last Name">
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="mobile" label="Mobile" rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="+61412345678" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Invalid email' }]}>
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="source" label="Source" rules={[{ required: true, message: 'Required' }]}>
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

        {/* ─── Contact Preferences ─────────────────────────────────── */}
        <Divider orientation="left" style={{ fontSize: 13 }}>Contact Preferences</Divider>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="preferredLanguage" label="Preferred Language">
              <Select
                allowClear
                options={PREFERRED_LANGUAGES.map((l) => ({ value: l, label: PREFERRED_LANGUAGE_LABELS[l] }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="preferredContact" label="Preferred Contact">
              <Select
                allowClear
                options={PREFERRED_CONTACTS.map((c) => ({ value: c, label: PREFERRED_CONTACT_LABELS[c] }))}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* ─── Location ────────────────────────────────────────────── */}
        <Divider orientation="left" style={{ fontSize: 13 }}>Location</Divider>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="suburb" label="Suburb">
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="state" label="State">
              <Select options={AU_STATES} allowClear />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="postcode"
              label="Postcode"
              rules={[{ pattern: /^\d{4}$/, message: 'Must be 4 digits' }]}
            >
              <Input maxLength={4} />
            </Form.Item>
          </Col>
        </Row>

        {/* ─── Financial ───────────────────────────────────────────── */}
        <Divider orientation="left" style={{ fontSize: 13 }}>Financial</Divider>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="financialYear" label="Financial Year">
              <Select
                options={getFinancialYears().map((y) => ({ value: y, label: y }))}
                allowClear
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="estimatedValue" label="Estimated Value ($)">
              <InputNumber min={0} style={{ width: '100%' }} placeholder="e.g. 500" prefix="$" />
            </Form.Item>
          </Col>
        </Row>

        {/* ─── Demographics ────────────────────────────────────────── */}
        <Divider orientation="left" style={{ fontSize: 13 }}>Demographics</Divider>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="maritalStatus" label="Marital Status">
              <Select
                allowClear
                options={MARITAL_STATUSES.map((m) => ({ value: m, label: MARITAL_STATUS_LABELS[m] }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="employmentType" label="Employment Type">
              <Select
                allowClear
                options={EMPLOYMENT_TYPES.map((e) => ({ value: e, label: EMPLOYMENT_TYPE_LABELS[e] }))}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="hasSpouse" label="Has Spouse" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="numberOfDependants" label="Dependants">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="hasRentalProperty" label="Rental Property" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="hasSharePortfolio" label="Shares" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="hasForeignIncome" label="Foreign Income" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>

        {/* ─── Notes ───────────────────────────────────────────────── */}
        <Divider orientation="left" style={{ fontSize: 13 }}>Notes</Divider>
        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
