'use client';

import { useCallback, useState } from 'react';
import {
  Row, Col, Card, Descriptions, Tabs, Table, Tag, Progress, Spin, Empty,
  Badge, Button, Modal, Select, Space, Typography, Upload, Input, message,
  Tooltip,
} from 'antd';
import {
  CloudUploadOutlined, InboxOutlined, EditOutlined, CheckCircleOutlined,
  SendOutlined, CreditCardOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UploadProps } from 'antd';
import { useOrder, useAssignOrder } from '@/hooks/useOrders';
import { useStaffList } from '@/hooks/useUsers';
import { useUploadOrderDocument, useSendForSignature, useGenerateSigningUri } from '@/hooks/useDocuments';
import { usePaymentsByOrder, useRefundPayment } from '@/hooks/usePayments';
import { OrderStatusTransition } from '../../_components/OrderStatusTransition';
import { CollectPaymentModal } from './CollectPaymentModal';
import { useQueryClient } from '@tanstack/react-query';
import type { OrderLineItem, OrderDocument, SigningStatus } from '@/types/order';
import { SIGNING_STATUS_LABELS, SIGNING_STATUS_COLORS } from '@/types/order';
import type { Payment } from '@/types/payment';
import { PAYMENT_STATUS_COLORS, PAYMENT_STATUS_LABELS } from '@/types/payment';
import { formatCurrency, formatDate, fullName } from '@/lib/utils/format';

const { Text } = Typography;
const { Dragger } = Upload;

const DOCUMENT_TYPES = [
  { value: 'tax_return', label: 'Tax Return' },
  { value: 'payment_summary', label: 'Payment Summary' },
  { value: 'identity', label: 'Identity Document' },
  { value: 'consent_form', label: 'Consent Form' },
  { value: 'notice_of_assessment', label: 'Notice of Assessment' },
  { value: 'other', label: 'Other' },
];

export function OrderDetailPage({ id }: { id: string }): React.ReactNode {
  const { data: order, isLoading } = useOrder(id);
  const uploadMutation = useUploadOrderDocument();
  const sendForSignMutation = useSendForSignature();
  const generateUriMutation = useGenerateSigningUri();
  const { data: paymentsData } = usePaymentsByOrder(id);
  const refundMutation = useRefundPayment();
  const qc = useQueryClient();
  const assignMutation = useAssignOrder();
  const { data: staffList } = useStaffList();

  // Collect Payment modal state
  const [collectOpen, setCollectOpen] = useState(false);

  // Upload modal state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadDocType, setUploadDocType] = useState<string | undefined>();

  // Send for Signature modal state
  const [signModalOpen, setSignModalOpen] = useState(false);
  const [signDocIndex, setSignDocIndex] = useState<number>(-1);
  const [signClientName, setSignClientName] = useState('');
  const [signClientEmail, setSignClientEmail] = useState('');
  const [signAdminName, setSignAdminName] = useState('');
  const [signAdminEmail, setSignAdminEmail] = useState('');

  // Refund modal state
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundPaymentId, setRefundPaymentId] = useState('');
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [refundReason, setRefundReason] = useState('');
  const [refundMaxAmount, setRefundMaxAmount] = useState<number>(0);

  // ─── Upload handler ───────────────────────────────────────────────────
  const handleDocUpload: UploadProps['customRequest'] = useCallback(
    (options: { file: unknown; onSuccess?: (body: unknown) => void; onError?: (err: Error) => void }) => {
      const formData = new FormData();
      formData.append('file', options.file as File);
      formData.append('orderId', id);
      if (uploadDocType) {
        formData.append('documentType', uploadDocType);
      }
      uploadMutation.mutate(
        { orderId: id, formData },
        {
          onSuccess: () => {
            void message.success('Document uploaded successfully');
            options.onSuccess?.({});
            setUploadOpen(false);
            setUploadDocType(undefined);
          },
          onError: () => {
            void message.error('Upload failed');
            options.onError?.(new Error('Upload failed'));
          },
        },
      );
    },
    [id, uploadDocType, uploadMutation],
  );

  // ─── Send for Signature handler ───────────────────────────────────────
  const handleOpenSignModal = useCallback(
    (docIndex: number) => {
      if (!order) return;
      setSignDocIndex(docIndex);
      setSignClientName(
        fullName(order.personalDetails?.firstName, order.personalDetails?.lastName),
      );
      setSignClientEmail(order.personalDetails?.email ?? '');
      setSignAdminName('');
      setSignAdminEmail('');
      setSignModalOpen(true);
    },
    [order],
  );

  const handleSendForSign = useCallback(() => {
    if (!signClientEmail || !signAdminEmail || !signClientName || !signAdminName) {
      void message.warning('All fields are required');
      return;
    }
    sendForSignMutation.mutate(
      {
        orderId: id,
        documentIndex: signDocIndex,
        clientName: signClientName,
        clientEmail: signClientEmail,
        adminName: signAdminName,
        adminEmail: signAdminEmail,
      },
      {
        onSuccess: () => {
          void message.success('Document sent for signature');
          setSignModalOpen(false);
        },
        onError: () => {
          void message.error('Failed to send for signature');
        },
      },
    );
  }, [
    id, signDocIndex, signClientName, signClientEmail,
    signAdminName, signAdminEmail, sendForSignMutation,
  ]);

  // ─── Counter-sign handler ─────────────────────────────────────────────
  const handleCounterSign = useCallback(
    (doc: OrderDocument) => {
      if (!doc.zohoRequestId || !doc.adminActionId) {
        void message.error('Missing signing info');
        return;
      }
      generateUriMutation.mutate(
        {
          orderId: id,
          zohoRequestId: doc.zohoRequestId,
          actionId: doc.adminActionId,
        },
        {
          onSuccess: (result) => {
            if (result.signUrl) {
              window.open(result.signUrl, '_blank');
            } else {
              void message.error('Signing URL not available');
            }
          },
          onError: () => {
            void message.error('Failed to get signing URL');
          },
        },
      );
    },
    [id, generateUriMutation],
  );

  if (isLoading) { return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />; }
  if (!order) { return <Empty description="Order not found" />; }

  // ─── Column definitions ───────────────────────────────────────────────
  const lineItemColumns: ColumnsType<OrderLineItem> = [
    { title: 'Service', dataIndex: 'title' },
    { title: 'Price', dataIndex: 'price', render: (v: number) => formatCurrency(v), width: 120 },
    { title: 'Qty', dataIndex: 'quantity', width: 60 },
    { title: 'Subtotal', dataIndex: 'subtotal', render: (v: number) => formatCurrency(v), width: 120 },
    {
      title: 'Status',
      dataIndex: 'completionStatus',
      render: (v: string) => <Tag>{v ?? 'pending'}</Tag>,
      width: 100,
    },
  ];

  const documentColumns: ColumnsType<OrderDocument> = [
    { title: 'File', dataIndex: 'fileName', ellipsis: true },
    { title: 'Type', dataIndex: 'documentType', render: (v: string) => v ?? '-', width: 130 },
    {
      title: 'Doc Status',
      dataIndex: 'status',
      width: 100,
      render: (v: string) => (
        <Badge status={v === 'signed' ? 'success' : v === 'verified' ? 'processing' : 'default'} text={v} />
      ),
    },
    {
      title: 'Signing',
      key: 'signingStatus',
      width: 160,
      render: (_: unknown, record: OrderDocument) => {
        const ss = (record.signingStatus ?? 'not_started') as SigningStatus;
        return (
          <Tooltip
            title={
              record.clientSignedAt
                ? `Client signed: ${formatDate(record.clientSignedAt)}${record.adminSignedAt ? ` | Admin signed: ${formatDate(record.adminSignedAt)}` : ''}`
                : undefined
            }
          >
            <Tag color={SIGNING_STATUS_COLORS[ss]}>{SIGNING_STATUS_LABELS[ss]}</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      render: (_: unknown, record: OrderDocument, index: number) => {
        const ss = (record.signingStatus ?? 'not_started') as SigningStatus;

        return (
          <Space size={4}>
            {ss === 'not_started' && (
              <Button
                type="link"
                size="small"
                icon={<SendOutlined />}
                onClick={() => { handleOpenSignModal(index); }}
              >
                Send for Sign
              </Button>
            )}

            {(ss === 'client_signed' || ss === 'awaiting_admin') && (
              <Button
                type="primary"
                size="small"
                icon={<EditOutlined />}
                loading={generateUriMutation.isPending}
                onClick={() => { handleCounterSign(record); }}
              >
                Counter-Sign
              </Button>
            )}

            {ss === 'completed' && (
              <Tag icon={<CheckCircleOutlined />} color="success">
                Complete
              </Tag>
            )}
          </Space>
        );
      },
    },
  ];

  const tabItems = [
    {
      key: 'overview',
      label: 'Overview',
      children: (
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="Client">
            {fullName(order.personalDetails?.firstName, order.personalDetails?.lastName)}
          </Descriptions.Item>
          <Descriptions.Item label="Email">{order.personalDetails?.email ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Mobile">{order.personalDetails?.mobile ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Financial Year">{order.financialYear}</Descriptions.Item>
          <Descriptions.Item label="Order Type">{order.orderType ?? 'standard'}</Descriptions.Item>
          <Descriptions.Item label="E-File Status">{order.eFileStatus ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="E-File Reference">{order.eFileReference ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="NOA Received">{order.noaReceived ? 'Yes' : 'No'}</Descriptions.Item>
          <Descriptions.Item label="Created">{formatDate(order.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="Updated">{formatDate(order.updatedAt)}</Descriptions.Item>
        </Descriptions>
      ),
    },
    {
      key: 'lineItems',
      label: `Line Items (${order.lineItems.length})`,
      children: (
        <div>
          <Table<OrderLineItem>
            columns={lineItemColumns}
            dataSource={order.lineItems}
            rowKey={(r) => r._id ?? r.salesItemId}
            pagination={false}
            size="small"
          />
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Descriptions column={1} size="small" style={{ maxWidth: 300, marginLeft: 'auto' }}>
              <Descriptions.Item label="Subtotal">{formatCurrency(order.totalAmount)}</Descriptions.Item>
              {order.discountPercent > 0 && (
                <Descriptions.Item label={`Discount (${order.discountPercent}%)`}>
                  -{formatCurrency(order.discountAmount)}
                </Descriptions.Item>
              )}
              <Descriptions.Item label={<strong>Total</strong>}>
                <strong>{formatCurrency(order.finalAmount)}</strong>
              </Descriptions.Item>
            </Descriptions>
          </div>
        </div>
      ),
    },
    {
      key: 'documents',
      label: `Documents (${order.documents.length})`,
      children: (
        <div>
          <div style={{ marginBottom: 12, textAlign: 'right' }}>
            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              size="small"
              onClick={() => { setUploadOpen(true); }}
            >
              Upload Document
            </Button>
          </div>
          <Table<OrderDocument>
            columns={documentColumns}
            dataSource={order.documents}
            rowKey={(r) => r.documentId ?? r.fileName}
            pagination={false}
            size="small"
          />

          {/* Upload Modal */}
          <Modal
            title="Upload Order Document"
            open={uploadOpen}
            onCancel={() => { setUploadOpen(false); setUploadDocType(undefined); }}
            footer={null}
            destroyOnClose
          >
            <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
              <div>
                <Text strong style={{ display: 'block', marginBottom: 4 }}>
                  Document Type (optional)
                </Text>
                <Select
                  value={uploadDocType}
                  onChange={setUploadDocType}
                  options={DOCUMENT_TYPES}
                  style={{ width: '100%' }}
                  placeholder="Select document type"
                  allowClear
                />
              </div>
            </Space>
            <Dragger
              customRequest={handleDocUpload as UploadProps['customRequest']}
              showUploadList={false}
              accept=".pdf,.jpg,.jpeg,.png,.heic,.tif,.tiff"
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Click or drag a file to upload</p>
              <p className="ant-upload-hint">PDF or image files up to 20 MB</p>
            </Dragger>
          </Modal>

          {/* Send for Signature Modal */}
          <Modal
            title="Send Document for Signature"
            open={signModalOpen}
            onCancel={() => { setSignModalOpen(false); }}
            onOk={handleSendForSign}
            okText="Send for Signature"
            okButtonProps={{ loading: sendForSignMutation.isPending }}
            destroyOnClose
          >
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Text type="secondary">
                The client will sign first. Once they complete their signature, the admin/staff
                member will be notified to counter-sign.
              </Text>

              <Card size="small" title="Client (Signs First)">
                <Space direction="vertical" style={{ width: '100%' }} size="small">
                  <div>
                    <Text strong style={{ display: 'block', marginBottom: 4 }}>Name *</Text>
                    <Input
                      value={signClientName}
                      onChange={(e) => { setSignClientName(e.target.value); }}
                      placeholder="Client full name"
                    />
                  </div>
                  <div>
                    <Text strong style={{ display: 'block', marginBottom: 4 }}>Email *</Text>
                    <Input
                      value={signClientEmail}
                      onChange={(e) => { setSignClientEmail(e.target.value); }}
                      placeholder="Client email"
                      type="email"
                    />
                  </div>
                </Space>
              </Card>

              <Card size="small" title="Admin / Staff (Counter-Signs)">
                <Space direction="vertical" style={{ width: '100%' }} size="small">
                  <div>
                    <Text strong style={{ display: 'block', marginBottom: 4 }}>Name *</Text>
                    <Input
                      value={signAdminName}
                      onChange={(e) => { setSignAdminName(e.target.value); }}
                      placeholder="Your full name"
                    />
                  </div>
                  <div>
                    <Text strong style={{ display: 'block', marginBottom: 4 }}>Email *</Text>
                    <Input
                      value={signAdminEmail}
                      onChange={(e) => { setSignAdminEmail(e.target.value); }}
                      placeholder="Your email"
                      type="email"
                    />
                  </div>
                </Space>
              </Card>
            </Space>
          </Modal>
        </div>
      ),
    },
    {
      key: 'payments',
      label: `Payments & Refunds`,
      children: (
        <div>
          {order.paymentStatus !== 'succeeded' && order.finalAmount > 0 && (
            <div style={{ marginBottom: 12, textAlign: 'right' }}>
              <Button
                type="primary"
                icon={<CreditCardOutlined />}
                onClick={() => { setCollectOpen(true); }}
              >
                Collect Payment
              </Button>
            </div>
          )}
          <Table<Payment>
            columns={[
              { title: 'Payment #', dataIndex: 'paymentNumber', key: 'paymentNumber' },
              { title: 'Gateway', dataIndex: 'gateway', key: 'gateway', render: (g: string) => g.toUpperCase() },
              { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (v: number) => formatCurrency(v) },
              { title: 'Refunded', dataIndex: 'refundedAmount', key: 'refundedAmount', render: (v: number) => v > 0 ? formatCurrency(v) : '-' },
              {
                title: 'Status', dataIndex: 'status', key: 'status',
                render: (s: string) => <Tag color={PAYMENT_STATUS_COLORS[s as keyof typeof PAYMENT_STATUS_COLORS]}>{PAYMENT_STATUS_LABELS[s as keyof typeof PAYMENT_STATUS_LABELS] ?? s}</Tag>,
              },
              { title: 'Date', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => formatDate(v) },
              {
                title: 'Actions', key: 'actions',
                render: (_: unknown, record: Payment) => {
                  const refundable = ['succeeded', 'captured', 'partially_refunded'].includes(record.status);
                  const remaining = record.amount - record.refundedAmount;
                  if (!refundable || remaining <= 0) return null;
                  return (
                    <Button
                      size="small"
                      danger
                      onClick={() => {
                        setRefundPaymentId(record._id);
                        setRefundMaxAmount(remaining);
                        setRefundAmount(remaining);
                        setRefundReason('');
                        setRefundModalOpen(true);
                      }}
                    >
                      Refund
                    </Button>
                  );
                },
              },
            ]}
            dataSource={paymentsData?.data ?? []}
            rowKey="_id"
            pagination={false}
            locale={{ emptyText: <Empty description="No payments found" /> }}
          />

          {/* Refund Modal */}
          <Modal
            title="Issue Refund"
            open={refundModalOpen}
            onCancel={() => setRefundModalOpen(false)}
            onOk={async () => {
              if (!refundPaymentId || refundAmount <= 0 || !refundReason.trim()) {
                message.error('Please fill in all fields');
                return;
              }
              try {
                await refundMutation.mutateAsync({
                  paymentId: refundPaymentId,
                  amount: refundAmount,
                  reason: refundReason,
                });
                message.success('Refund processed successfully');
                setRefundModalOpen(false);
              } catch (err) {
                const error = err as Error & { response?: { data?: { message?: string } } };
                message.error(error.response?.data?.message ?? 'Refund failed');
              }
            }}
            okText="Process Refund"
            okButtonProps={{ danger: true, loading: refundMutation.isPending }}
            destroyOnClose
          >
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <Text strong style={{ display: 'block', marginBottom: 4 }}>
                  Max refundable: {formatCurrency(refundMaxAmount)}
                </Text>
              </div>
              <div>
                <Text strong style={{ display: 'block', marginBottom: 4 }}>Refund Amount (cents)</Text>
                <Input
                  type="number"
                  value={refundAmount}
                  onChange={(e) => {
                    const val = Math.min(Number(e.target.value), refundMaxAmount);
                    setRefundAmount(val);
                  }}
                  min={1}
                  max={refundMaxAmount}
                />
                <Text type="secondary">{formatCurrency(refundAmount)}</Text>
              </div>
              <div>
                <Text strong style={{ display: 'block', marginBottom: 4 }}>Reason *</Text>
                <Input.TextArea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Reason for refund..."
                  rows={3}
                />
              </div>
            </Space>
          </Modal>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>
          {order.orderNumber} - {fullName(order.personalDetails?.firstName, order.personalDetails?.lastName)}
        </h2>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card>
            <Tabs items={tabItems} />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Status" style={{ marginBottom: 16 }}>
            <OrderStatusTransition orderId={id} currentStatus={order.status} />
          </Card>

          <Card title="Progress" style={{ marginBottom: 16 }}>
            <Progress
              type="circle"
              percent={order.completionPercent}
              size={120}
              style={{ display: 'block', margin: '0 auto' }}
            />
          </Card>

          <Card title="Financial Summary" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Subtotal">{formatCurrency(order.totalAmount)}</Descriptions.Item>
              <Descriptions.Item label="Discount">{order.discountPercent}%</Descriptions.Item>
              {order.discountAmount > 0 && (
                <Descriptions.Item label="Discount Amount">-{formatCurrency(order.discountAmount)}</Descriptions.Item>
              )}
              {order.promoCode && (
                <Descriptions.Item label="Promo Code">
                  <Tag color="blue">{order.promoCode}</Tag>
                </Descriptions.Item>
              )}
              {(order.creditApplied ?? 0) > 0 && (
                <Descriptions.Item label="Credit Applied">-{formatCurrency(order.creditApplied)}</Descriptions.Item>
              )}
              <Descriptions.Item label="Final">{formatCurrency(order.finalAmount)}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Assigned Staff">
            <Space direction="vertical" style={{ width: '100%' }}>
              {order.processingByName && (
                <Text>
                  Currently: <strong>{order.processingByName}</strong>
                </Text>
              )}
              <Select
                style={{ width: '100%' }}
                placeholder="Assign / reassign staff…"
                value={order.processingBy}
                showSearch
                optionFilterProp="label"
                loading={assignMutation.isPending}
                onChange={(staffId: string) => {
                  assignMutation.mutate(
                    { id, processingBy: staffId },
                    {
                      onSuccess: () => { void message.success('Order assigned'); },
                      onError: () => { void message.error('Assignment failed'); },
                    },
                  );
                }}
                options={(staffList ?? []).map((u) => ({
                  value: u._id,
                  label: `${fullName(u.firstName, u.lastName)} (${u.email})`,
                }))}
              />
            </Space>
          </Card>
        </Col>
      </Row>

      <CollectPaymentModal
        open={collectOpen}
        onClose={() => { setCollectOpen(false); }}
        orderId={id}
        orderNumber={order.orderNumber}
        baseAmount={order.finalAmount}
        onSuccess={() => {
          setCollectOpen(false);
          void qc.invalidateQueries({ queryKey: ['orders', id] });
          void qc.invalidateQueries({ queryKey: ['payments', 'order', id] });
        }}
      />
    </div>
  );
}
