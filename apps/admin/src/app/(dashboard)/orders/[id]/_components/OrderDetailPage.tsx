'use client';

import { useCallback, useState } from 'react';
import { Row, Col, Card, Descriptions, Tabs, Table, Tag, Progress, Spin, Empty, Badge, Button, Modal, Select, Space, Typography, Upload, message } from 'antd';
import { CloudUploadOutlined, InboxOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UploadProps } from 'antd';
import { useOrder } from '@/hooks/useOrders';
import { useUploadOrderDocument } from '@/hooks/useDocuments';
import { OrderStatusTransition } from '../../_components/OrderStatusTransition';
import type { OrderLineItem, OrderDocument } from '@/types/order';
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
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadDocType, setUploadDocType] = useState<string | undefined>();

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

  if (isLoading) { return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />; }
  if (!order) { return <Empty description="Order not found" />; }

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
    { title: 'File', dataIndex: 'fileName' },
    { title: 'Type', dataIndex: 'documentType', render: (v: string) => v ?? '-' },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (v: string) => (
        <Badge status={v === 'signed' ? 'success' : v === 'verified' ? 'processing' : 'default'} text={v} />
      ),
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
              <Descriptions.Item label="Final">{formatCurrency(order.finalAmount)}</Descriptions.Item>
            </Descriptions>
          </Card>

          {order.processingByName && (
            <Card title="Processing By">
              <strong>{order.processingByName}</strong>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}
