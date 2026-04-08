'use client';

import { useEffect } from 'react';
import { Modal, Form, Input, Select, Row, Col, App } from 'antd';
import { useCreateUser, useUpdateUser } from '@/hooks/useUsers';
import { USER_TYPE_LABELS } from '@/types/user';
import type { User } from '@/types/user';
import { AU_STATES, GENDER_OPTIONS } from '@/lib/utils/constants';

interface UserFormModalProps {
  open: boolean;
  onClose: () => void;
  user?: User;
}

export function UserFormModal({ open, onClose, user }: UserFormModalProps): React.ReactNode {
  const [form] = Form.useForm();
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const { message } = App.useApp();
  const isEdit = !!user;

  useEffect(() => {
    if (open && user) {
      form.setFieldsValue({
        ...user,
        'address.street': user.address?.street,
        'address.suburb': user.address?.suburb,
        'address.state': user.address?.state,
        'address.postcode': user.address?.postcode,
      });
    } else if (open) {
      form.resetFields();
    }
  }, [open, user, form]);

  const handleSubmit = async (): Promise<void> => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      address: {
        street: values['address.street'],
        suburb: values['address.suburb'],
        state: values['address.state'],
        postcode: values['address.postcode'],
      },
    };
    delete payload['address.street'];
    delete payload['address.suburb'];
    delete payload['address.state'];
    delete payload['address.postcode'];

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: user._id, data: payload });
        message.success('User updated');
      } else {
        await createMutation.mutateAsync(payload);
        message.success('User created');
      }
      onClose();
    } catch {
      message.error(isEdit ? 'Failed to update user' : 'Failed to create user');
    }
  };

  const typeOptions = Object.entries(USER_TYPE_LABELS).map(([value, label]) => ({
    value: Number(value),
    label,
  }));

  return (
    <Modal
      title={isEdit ? 'Edit User' : 'New User'}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={createMutation.isPending || updateMutation.isPending}
      width={680}
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
            <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="mobile" label="Mobile">
              <Input placeholder="+61412345678" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="userType" label="User Type" rules={[{ required: true }]}>
              <Select options={typeOptions} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="gender" label="Gender">
              <Select options={GENDER_OPTIONS} allowClear />
            </Form.Item>
          </Col>
        </Row>
        {!isEdit && (
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="password"
                label="Password"
                rules={[{ required: true, min: 8, message: 'Min 8 characters' }]}
              >
                <Input.Password />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="preferredContact" label="Preferred Contact">
                <Select
                  allowClear
                  options={[
                    { value: 'call', label: 'Call' },
                    { value: 'sms', label: 'SMS' },
                    { value: 'email', label: 'Email' },
                    { value: 'whatsapp', label: 'WhatsApp' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
        )}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="address.street" label="Street">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="address.suburb" label="Suburb">
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="address.state" label="State">
              <Select options={AU_STATES} allowClear />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="address.postcode" label="Postcode">
              <Input maxLength={4} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
