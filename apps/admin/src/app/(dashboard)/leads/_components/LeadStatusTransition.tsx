'use client';

import { useState } from 'react';
import { Button, Tag, Space, Modal, Form, Select, Input, App } from 'antd';
import { useTransitionLeadStatus } from '@/hooks/useLeads';
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
  LEAD_STATUS_TRANSITIONS,
  LeadStatus,
} from '@/types/lead';

interface LeadStatusTransitionProps {
  leadId: string;
  currentStatus: number;
}

const LOST_REASONS = [
  { value: 'too_expensive', label: 'Too Expensive' },
  { value: 'went_elsewhere', label: 'Went Elsewhere' },
  { value: 'not_ready', label: 'Not Ready' },
  { value: 'no_response', label: 'No Response' },
  { value: 'duplicate', label: 'Duplicate Lead' },
  { value: 'other', label: 'Other' },
];

export function LeadStatusTransition({
  leadId,
  currentStatus,
}: LeadStatusTransitionProps): React.ReactNode {
  const [showLostModal, setShowLostModal] = useState(false);
  const [form] = Form.useForm();
  const transition = useTransitionLeadStatus();
  const { message } = App.useApp();

  const validTransitions = LEAD_STATUS_TRANSITIONS[currentStatus] ?? [];

  const handleTransition = async (newStatus: number): Promise<void> => {
    if (newStatus === LeadStatus.Lost) {
      setShowLostModal(true);
      return;
    }
    try {
      await transition.mutateAsync({ id: leadId, status: newStatus });
      message.success(`Status changed to ${LEAD_STATUS_LABELS[newStatus]}`);
    } catch {
      message.error('Failed to change status');
    }
  };

  const handleLostSubmit = async (): Promise<void> => {
    const values = await form.validateFields();
    try {
      await transition.mutateAsync({
        id: leadId,
        status: LeadStatus.Lost,
        lostReason: values.lostReason,
        lostReasonNote: values.lostReasonNote,
      });
      message.success('Lead marked as Lost');
      setShowLostModal(false);
      form.resetFields();
    } catch {
      message.error('Failed to change status');
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <span style={{ marginRight: 8 }}>Current Status:</span>
        <Tag color={LEAD_STATUS_COLORS[currentStatus]} style={{ fontSize: 14, padding: '4px 12px' }}>
          {LEAD_STATUS_LABELS[currentStatus]}
        </Tag>
      </div>

      {validTransitions.length > 0 && (
        <Space wrap>
          {validTransitions.map((status) => (
            <Button
              key={status}
              size="small"
              type={status === LeadStatus.Won ? 'primary' : 'default'}
              danger={status === LeadStatus.Lost}
              loading={transition.isPending}
              onClick={() => handleTransition(status)}
            >
              {LEAD_STATUS_LABELS[status]}
            </Button>
          ))}
        </Space>
      )}

      <Modal
        title="Mark as Lost"
        open={showLostModal}
        onCancel={() => setShowLostModal(false)}
        onOk={handleLostSubmit}
        confirmLoading={transition.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="lostReason" label="Reason" rules={[{ required: true }]}>
            <Select options={LOST_REASONS} />
          </Form.Item>
          <Form.Item name="lostReasonNote" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
