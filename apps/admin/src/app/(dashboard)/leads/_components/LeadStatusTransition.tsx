'use client';

import { useState } from 'react';
import { Button, Tag, Space, Modal, Form, Select, Input, App } from 'antd';
import { useTransitionLeadStatus } from '@/hooks/useLeads';
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
  LEAD_STATUS_TRANSITIONS,
  LeadStatus,
  LOST_REASONS,
  LOST_REASON_LABELS,
} from '@/types/lead';

interface LeadStatusTransitionProps {
  leadId: string;
  currentStatus: number;
  onConvert?: () => void;
}

const LOST_REASON_OPTIONS = LOST_REASONS.map((r) => ({
  value: r,
  label: LOST_REASON_LABELS[r] ?? r,
}));

export function LeadStatusTransition({
  leadId,
  currentStatus,
  onConvert,
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
    if (newStatus === LeadStatus.Won) {
      // Won is terminal — only reachable via conversion
      if (onConvert) {
        onConvert();
      } else {
        message.info('Use "Convert to Client" to mark this lead as Won');
      }
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
        <Tag
          color={LEAD_STATUS_COLORS[currentStatus]}
          style={{ fontSize: 14, padding: '4px 12px' }}
        >
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
              onClick={() => {
                void handleTransition(status);
              }}
            >
              {status === LeadStatus.Won ? 'Convert & Win' : LEAD_STATUS_LABELS[status]}
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
            <Select options={LOST_REASON_OPTIONS} />
          </Form.Item>
          <Form.Item name="lostReasonNote" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
