'use client';

import { useState } from 'react';
import { Button, Tag, Space, Modal, Form, Input, App } from 'antd';
import { useTransitionOrderStatus } from '@/hooks/useOrders';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_TRANSITIONS,
  OrderStatus,
} from '@/types/order';

interface OrderStatusTransitionProps {
  orderId: string;
  currentStatus: number;
}

export function OrderStatusTransition({
  orderId,
  currentStatus,
}: OrderStatusTransitionProps): React.ReactNode {
  const [showModal, setShowModal] = useState<number | null>(null);
  const [form] = Form.useForm();
  const transition = useTransitionOrderStatus();
  const { message } = App.useApp();

  const validTransitions = ORDER_STATUS_TRANSITIONS[currentStatus] ?? [];

  const handleTransition = async (newStatus: number): Promise<void> => {
    // Lodged requires eFileReference, Cancelled requires reason
    if (newStatus === OrderStatus.Lodged || newStatus === OrderStatus.Cancelled) {
      setShowModal(newStatus);
      return;
    }
    try {
      await transition.mutateAsync({ id: orderId, status: newStatus });
      message.success(`Status changed to ${ORDER_STATUS_LABELS[newStatus]}`);
    } catch {
      message.error('Failed to change status');
    }
  };

  const handleModalSubmit = async (): Promise<void> => {
    const values = await form.validateFields();
    try {
      await transition.mutateAsync({
        id: orderId,
        status: showModal!,
        eFileReference: values.eFileReference,
        cancelReason: values.cancelReason,
      });
      message.success(`Status changed to ${ORDER_STATUS_LABELS[showModal!]}`);
      setShowModal(null);
      form.resetFields();
    } catch {
      message.error('Failed to change status');
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <span style={{ marginRight: 8 }}>Current:</span>
        <Tag color={ORDER_STATUS_COLORS[currentStatus]} style={{ fontSize: 14, padding: '4px 12px' }}>
          {ORDER_STATUS_LABELS[currentStatus]}
        </Tag>
      </div>

      {validTransitions.length > 0 && (
        <Space wrap>
          {validTransitions.map((status) => (
            <Button
              key={status}
              size="small"
              type={status === OrderStatus.Completed || status === OrderStatus.Lodged ? 'primary' : 'default'}
              danger={status === OrderStatus.Cancelled}
              loading={transition.isPending}
              onClick={() => handleTransition(status)}
            >
              {ORDER_STATUS_LABELS[status]}
            </Button>
          ))}
        </Space>
      )}

      <Modal
        title={showModal === OrderStatus.Lodged ? 'Lodge Order' : 'Cancel Order'}
        open={showModal !== null}
        onCancel={() => { setShowModal(null); form.resetFields(); }}
        onOk={handleModalSubmit}
        confirmLoading={transition.isPending}
      >
        <Form form={form} layout="vertical">
          {showModal === OrderStatus.Lodged && (
            <Form.Item name="eFileReference" label="E-File Reference" rules={[{ required: true }]}>
              <Input placeholder="ATO e-file reference number" />
            </Form.Item>
          )}
          {showModal === OrderStatus.Cancelled && (
            <Form.Item name="cancelReason" label="Cancel Reason" rules={[{ required: true }]}>
              <Input.TextArea rows={3} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
