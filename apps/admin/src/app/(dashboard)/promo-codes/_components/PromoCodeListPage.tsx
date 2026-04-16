'use client';

import React, { useState } from 'react';
import {
  Table,
  Button,
  Tag,
  Space,
  Input,
  Card,
  Modal,
  Form,
  Select,
  InputNumber,
  DatePicker,
  message,
  Popconfirm,
  Typography,
} from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import {
  usePromoCodeList,
  useCreatePromoCode,
  useUpdatePromoCode,
  useDeactivatePromoCode,
} from '@/hooks/usePromoCodes';
import type { PromoCode, CreatePromoCodeInput, PromoCodeListQuery } from '@/types/promoCode';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import Link from 'next/link';

const { Title } = Typography;

export default function PromoCodeListPage(): React.ReactNode {
  const [filters, setFilters] = useState<PromoCodeListQuery>({ page: 1, limit: 20 });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<PromoCode | null>(null);
  const [form] = Form.useForm();

  const { data, isLoading } = usePromoCodeList(filters);
  const createMutation = useCreatePromoCode();
  const updateMutation = useUpdatePromoCode();
  const deactivateMutation = useDeactivatePromoCode();

  const promoCodes = data?.data?.promoCodes ?? [];
  const total = data?.data?.total ?? 0;

  const openCreate = (): void => {
    setEditingPromo(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (promo: PromoCode): void => {
    setEditingPromo(promo);
    form.setFieldsValue({
      ...promo,
      validFrom: dayjs(promo.validFrom),
      validUntil: dayjs(promo.validUntil),
      discountValue:
        promo.discountType === 'percent' ? promo.discountValue : promo.discountValue / 100,
      minOrderAmount: (promo.minOrderAmount ?? 0) / 100,
      maxDiscountAmount: promo.maxDiscountAmount ? promo.maxDiscountAmount / 100 : undefined,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (): Promise<void> => {
    try {
      const values = await form.validateFields();
      const payload: CreatePromoCodeInput = {
        code: values.code,
        description: values.description,
        discountType: values.discountType,
        discountValue:
          values.discountType === 'percent'
            ? values.discountValue
            : Math.round(values.discountValue * 100),
        minOrderAmount: values.minOrderAmount ? Math.round(values.minOrderAmount * 100) : 0,
        maxDiscountAmount: values.maxDiscountAmount
          ? Math.round(values.maxDiscountAmount * 100)
          : undefined,
        maxUsageTotal: values.maxUsageTotal,
        maxUsagePerUser: values.maxUsagePerUser,
        validFrom: values.validFrom.toISOString(),
        validUntil: values.validUntil.toISOString(),
      };

      if (editingPromo) {
        await updateMutation.mutateAsync({ id: editingPromo._id, data: payload });
        message.success('Promo code updated');
      } else {
        await createMutation.mutateAsync(payload);
        message.success('Promo code created');
      }
      setModalOpen(false);
    } catch {
      // form validation or API error
    }
  };

  const handleDeactivate = async (id: string): Promise<void> => {
    await deactivateMutation.mutateAsync(id);
    message.success('Promo code deactivated');
  };

  const columns: ColumnsType<PromoCode> = [
    {
      title: 'Code',
      dataIndex: 'code',
      key: 'code',
      render: (code: string, record: PromoCode) => (
        <Link href={`/promo-codes/${record._id}`}>
          <strong>{code}</strong>
        </Link>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Discount',
      key: 'discount',
      render: (_: unknown, record: PromoCode) =>
        record.discountType === 'percent'
          ? `${record.discountValue}%`
          : `$${(record.discountValue / 100).toFixed(2)}`,
    },
    {
      title: 'Usage',
      key: 'usage',
      render: (_: unknown, record: PromoCode) =>
        `${record.usageCount}${record.maxUsageTotal ? ` / ${record.maxUsageTotal}` : ''}`,
    },
    {
      title: 'Valid',
      key: 'validity',
      render: (_: unknown, record: PromoCode) => (
        <span>
          {dayjs(record.validFrom).format('DD/MM/YY')} -{' '}
          {dayjs(record.validUntil).format('DD/MM/YY')}
        </span>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: unknown, record: PromoCode) => {
        const now = new Date();
        if (!record.isActive) return <Tag color="red">Inactive</Tag>;
        if (new Date(record.validUntil) < now) return <Tag color="orange">Expired</Tag>;
        if (new Date(record.validFrom) > now) return <Tag color="blue">Scheduled</Tag>;
        return <Tag color="green">Active</Tag>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: PromoCode) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            Edit
          </Button>
          <Popconfirm
            title="Deactivate this promo code?"
            onConfirm={() => handleDeactivate(record._id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              Deactivate
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Title level={3} style={{ margin: 0 }}>
          Promo Codes
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Create Promo Code
        </Button>
      </div>

      <Card>
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder="Search by code..."
            prefix={<SearchOutlined />}
            style={{ width: 300 }}
            allowClear
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
          />
        </div>

        <Table
          columns={columns}
          dataSource={promoCodes}
          rowKey="_id"
          loading={isLoading}
          pagination={{
            current: filters.page,
            pageSize: filters.limit,
            total,
            onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, limit: pageSize })),
            showSizeChanger: true,
            showTotal: (t) => `Total ${t} promo codes`,
          }}
        />
      </Card>

      <Modal
        title={editingPromo ? 'Edit Promo Code' : 'Create Promo Code'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="code"
            label="Code"
            rules={[{ required: !editingPromo, min: 3, max: 30 }]}
          >
            <Input
              placeholder="e.g. SAVE20"
              disabled={!!editingPromo}
              style={{ textTransform: 'uppercase' }}
            />
          </Form.Item>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}>
            <Input placeholder="e.g. 20% off your first tax return" />
          </Form.Item>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item
              name="discountType"
              label="Discount Type"
              rules={[{ required: true }]}
              initialValue="percent"
            >
              <Select style={{ width: 150 }}>
                <Select.Option value="percent">Percentage</Select.Option>
                <Select.Option value="flat">Flat Amount</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="discountValue" label="Discount Value" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: 150 }} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="minOrderAmount" label="Min Order ($)">
              <InputNumber min={0} precision={2} style={{ width: 150 }} />
            </Form.Item>
            <Form.Item name="maxDiscountAmount" label="Max Discount ($)">
              <InputNumber min={0} precision={2} style={{ width: 150 }} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="maxUsageTotal" label="Max Total Uses">
              <InputNumber min={1} style={{ width: 150 }} />
            </Form.Item>
            <Form.Item name="maxUsagePerUser" label="Max Per User" initialValue={1}>
              <InputNumber min={1} style={{ width: 150 }} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="validFrom" label="Valid From" rules={[{ required: true }]}>
              <DatePicker showTime style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="validUntil" label="Valid Until" rules={[{ required: true }]}>
              <DatePicker showTime style={{ width: 200 }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
