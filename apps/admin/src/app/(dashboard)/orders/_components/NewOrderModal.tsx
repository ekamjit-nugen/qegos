'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Modal,
  Form,
  Select,
  Input,
  InputNumber,
  Button,
  Space,
  Table,
  Typography,
  Spin,
  Empty,
  message,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useUserList } from '@/hooks/useUsers';
import { useSalesList, type SalesItem } from '@/hooks/useSales';
import { useCreateOrder } from '@/hooks/useOrders';
import { getFinancialYears } from '@/lib/utils/constants';
import { formatCurrency, fullName } from '@/lib/utils/format';
import type { User } from '@/types/user';

const { Text } = Typography;

interface NewOrderModalProps {
  open: boolean;
  onClose: () => void;
}

interface LineDraft {
  salesId: string;
  title: string;
  price: number;
  quantity: number;
}

interface FormValues {
  userId: string;
  financialYear: string;
  orderType?: string;
  notes?: string;
}

const ORDER_TYPES = [
  { value: 'standard', label: 'Standard' },
  { value: 'amendment', label: 'Amendment' },
  { value: 'late', label: 'Late' },
];

export function NewOrderModal({ open, onClose }: NewOrderModalProps): React.ReactNode {
  const router = useRouter();
  const [form] = Form.useForm<FormValues>();
  const [clientSearch, setClientSearch] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [salesPick, setSalesPick] = useState<string | undefined>();
  const [salesQty, setSalesQty] = useState<number>(1);

  const usersQuery = useUserList({
    page: 1,
    limit: 20,
    search: clientSearch || undefined,
    userType: 2, // Client
  });
  const salesQuery = useSalesList();
  const createMutation = useCreateOrder();

  const clientOptions = useMemo(
    () =>
      (usersQuery.data?.data ?? []).map((u: User) => ({
        value: u._id,
        label: `${fullName(u.firstName, u.lastName)} — ${u.email}`,
        user: u,
      })),
    [usersQuery.data],
  );

  const salesOptions = useMemo(
    () =>
      (salesQuery.data ?? [])
        .filter((s: SalesItem) => s.isActive)
        .map((s) => ({
          value: s._id,
          label: `${s.title} — ${formatCurrency(s.price)}`,
          item: s,
        })),
    [salesQuery.data],
  );

  function handleAddLine(): void {
    if (!salesPick) return;
    const item = salesOptions.find((o) => o.value === salesPick)?.item;
    if (!item) return;
    setLines((prev) => [
      ...prev,
      { salesId: item._id, title: item.title, price: item.price, quantity: salesQty },
    ]);
    setSalesPick(undefined);
    setSalesQty(1);
  }

  function handleRemoveLine(idx: number): void {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);

  function handleClose(): void {
    form.resetFields();
    setLines([]);
    setSalesPick(undefined);
    setSalesQty(1);
    setClientSearch('');
    onClose();
  }

  async function handleSubmit(): Promise<void> {
    try {
      const values = await form.validateFields();
      if (lines.length === 0) {
        void message.error('Add at least one service');
        return;
      }
      const selectedClient = clientOptions.find((o) => o.value === values.userId)?.user;
      if (!selectedClient) {
        void message.error('Pick a client');
        return;
      }
      const created = await createMutation.mutateAsync({
        userId: values.userId,
        financialYear: values.financialYear,
        orderType: values.orderType ?? 'standard',
        notes: values.notes,
        personalDetails: {
          firstName: selectedClient.firstName,
          lastName: selectedClient.lastName,
          email: selectedClient.email,
          mobile: selectedClient.mobile,
        },
        lineItems: lines.map((l) => ({
          salesItemId: l.salesId,
          salesId: l.salesId,
          title: l.title,
          price: l.price,
          quantity: l.quantity,
          subtotal: l.price * l.quantity,
        })) as never,
      } as never);
      void message.success('Order created');
      handleClose();
      router.push(`/orders/${created._id}`);
    } catch (err) {
      const e = err as Error & { response?: { data?: { message?: string } } };
      if (e.response?.data?.message) {
        void message.error(e.response.data.message);
      }
    }
  }

  return (
    <Modal
      title="New Order"
      open={open}
      onCancel={handleClose}
      width={680}
      destroyOnClose
      footer={[
        <Button key="cancel" onClick={handleClose}>
          Cancel
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={createMutation.isPending}
          onClick={handleSubmit}
        >
          Create Order
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="userId"
          label="Client"
          rules={[{ required: true, message: 'Pick a client' }]}
        >
          <Select
            showSearch
            placeholder="Search by name or email…"
            filterOption={false}
            onSearch={(v) => setClientSearch(v)}
            notFoundContent={usersQuery.isFetching ? <Spin size="small" /> : <Empty />}
            options={clientOptions}
          />
        </Form.Item>

        <Space size="middle" style={{ width: '100%' }}>
          <Form.Item
            name="financialYear"
            label="Financial Year"
            rules={[{ required: true, message: 'Required' }]}
            style={{ minWidth: 180 }}
          >
            <Select
              placeholder="Select FY"
              options={getFinancialYears().map((y) => ({ value: y, label: y }))}
            />
          </Form.Item>

          <Form.Item
            name="orderType"
            label="Order Type"
            initialValue="standard"
            style={{ minWidth: 180 }}
          >
            <Select options={ORDER_TYPES} />
          </Form.Item>
        </Space>

        <Form.Item label="Services">
          <Space.Compact style={{ width: '100%' }}>
            <Select
              placeholder="Pick a service"
              value={salesPick}
              onChange={setSalesPick}
              options={salesOptions}
              style={{ flex: 1 }}
              showSearch
              optionFilterProp="label"
            />
            <InputNumber
              min={1}
              value={salesQty}
              onChange={(v) => setSalesQty(Number(v) || 1)}
              style={{ width: 80 }}
            />
            <Button icon={<PlusOutlined />} onClick={handleAddLine} disabled={!salesPick}>
              Add
            </Button>
          </Space.Compact>

          <Table<LineDraft>
            style={{ marginTop: 12 }}
            size="small"
            pagination={false}
            dataSource={lines}
            rowKey={(_, i) => String(i)}
            locale={{ emptyText: 'No services added yet' }}
            columns={[
              { title: 'Service', dataIndex: 'title' },
              {
                title: 'Price',
                dataIndex: 'price',
                width: 110,
                render: (v: number) => formatCurrency(v),
              },
              { title: 'Qty', dataIndex: 'quantity', width: 60 },
              {
                title: 'Subtotal',
                width: 110,
                render: (_, r: LineDraft) => formatCurrency(r.price * r.quantity),
              },
              {
                title: '',
                width: 50,
                render: (_, _r, idx) => (
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemoveLine(idx)}
                  />
                ),
              },
            ]}
            footer={() => (
              <div style={{ textAlign: 'right' }}>
                <Text strong>Subtotal: {formatCurrency(subtotal)}</Text>
              </div>
            )}
          />
        </Form.Item>

        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={2} placeholder="Optional internal notes" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
