'use client';

import React, { useState } from 'react';
import { Modal, Form, Select, Checkbox, App } from 'antd';
import { useExportAnalytics, type ExportParams } from '@/hooks/useAnalytics';
import { useAnalyticsContext } from './AnalyticsContext';

const WIDGET_OPTIONS = [
  { label: 'Executive Summary', value: 'executive-summary' },
  { label: 'Revenue Forecast', value: 'revenue-forecast' },
  { label: 'Collection Rate', value: 'collection-rate' },
  { label: 'Pipeline Health', value: 'pipeline-health' },
  { label: 'Service Mix', value: 'service-mix' },
  { label: 'Seasonal Trends', value: 'seasonal-trends' },
  { label: 'Staff Benchmark', value: 'staff-benchmark' },
  { label: 'Channel ROI', value: 'channel-roi' },
  { label: 'Customer Lifetime Value', value: 'clv' },
  { label: 'Churn Risk', value: 'churn-risk' },
];

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
}

export function ExportModal({ open, onClose }: ExportModalProps): React.ReactNode {
  const { message } = App.useApp();
  const { filters } = useAnalyticsContext();
  const exportMutation = useExportAnalytics();
  const [form] = Form.useForm<{ format: 'pdf' | 'xlsx'; widgets: string[] }>();

  const handleExport = async (): Promise<void> => {
    try {
      const values = await form.validateFields();
      const params: ExportParams = {
        format: values.format,
        widgets: values.widgets,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      };
      const result = await exportMutation.mutateAsync(params);
      void message.success(`Export queued (Job: ${result.jobId}). You'll be notified when ready.`);
      onClose();
      form.resetFields();
    } catch {
      // validation or API error
    }
  };

  return (
    <Modal
      title="Export Analytics Report"
      open={open}
      onOk={() => void handleExport()}
      onCancel={onClose}
      okText="Export"
      okButtonProps={{ loading: exportMutation.isPending }}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          format: 'pdf',
          widgets: WIDGET_OPTIONS.map((w) => w.value),
        }}
      >
        <Form.Item name="format" label="Format" rules={[{ required: true }]}>
          <Select
            options={[
              { label: 'PDF Report', value: 'pdf' },
              { label: 'Excel Spreadsheet (XLSX)', value: 'xlsx' },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="widgets"
          label="Include Widgets"
          rules={[{ required: true, message: 'Select at least one widget' }]}
        >
          <Checkbox.Group
            options={WIDGET_OPTIONS}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          />
        </Form.Item>

        <div style={{ fontSize: 12, color: '#8c8c8c' }}>
          Date range: {filters.dateFrom} to {filters.dateTo}
        </div>
      </Form>
    </Modal>
  );
}
