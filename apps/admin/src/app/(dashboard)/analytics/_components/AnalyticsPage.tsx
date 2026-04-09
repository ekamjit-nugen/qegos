'use client';

import React, { useState } from 'react';
import { Row, Col, DatePicker, Button, Space, Segmented, Tooltip } from 'antd';
import {
  ReloadOutlined,
  DownloadOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { AnalyticsProvider, useAnalyticsContext } from './AnalyticsContext';
import { ExportModal } from './ExportModal';
import { ExecutiveSummaryWidget } from './widgets/ExecutiveSummaryWidget';
import { RevenueForecastWidget } from './widgets/RevenueForecastWidget';
import { ClvWidget } from './widgets/ClvWidget';
import { StaffBenchmarkWidget } from './widgets/StaffBenchmarkWidget';
import { ChannelRoiWidget } from './widgets/ChannelRoiWidget';
import { SeasonalTrendsWidget } from './widgets/SeasonalTrendsWidget';
import { ChurnRiskWidget } from './widgets/ChurnRiskWidget';
import { ServiceMixWidget } from './widgets/ServiceMixWidget';
import { CollectionRateWidget } from './widgets/CollectionRateWidget';
import { PipelineHealthWidget } from './widgets/PipelineHealthWidget';

const { RangePicker } = DatePicker;

// ─── Preset date ranges ─────────────────────────────────────────────

const rangePresets: Array<{ label: string; value: [dayjs.Dayjs, dayjs.Dayjs] }> = [
  { label: 'Last 30 Days', value: [dayjs().subtract(30, 'day'), dayjs()] },
  { label: 'Last 90 Days', value: [dayjs().subtract(90, 'day'), dayjs()] },
  { label: 'Last 6 Months', value: [dayjs().subtract(6, 'month'), dayjs()] },
  { label: 'Last 12 Months', value: [dayjs().subtract(1, 'year'), dayjs()] },
  { label: 'This FY', value: [
    dayjs().month() >= 6
      ? dayjs().month(6).startOf('month')
      : dayjs().subtract(1, 'year').month(6).startOf('month'),
    dayjs(),
  ]},
];

// ─── Toolbar (inside provider) ──────────────────────────────────────

function AnalyticsToolbar(): React.ReactNode {
  const { filters, setDateRange, setGranularity, refresh } = useAnalyticsContext();
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CalendarOutlined style={{ fontSize: 22, color: '#1677ff' }} />
          <h2 style={{ margin: 0, fontSize: 20 }}>Analytics Dashboard</h2>
        </div>

        <Space wrap size="middle">
          <RangePicker
            value={[dayjs(filters.dateFrom), dayjs(filters.dateTo)]}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setDateRange(dates[0], dates[1]);
              }
            }}
            presets={rangePresets}
            allowClear={false}
            format="DD/MM/YYYY"
            style={{ width: 260 }}
          />

          <Segmented
            options={[
              { label: 'Monthly', value: 'month' },
              { label: 'Weekly', value: 'week' },
            ]}
            value={filters.granularity}
            onChange={(v) => setGranularity(v as 'week' | 'month')}
            size="middle"
          />

          <Tooltip title="Refresh all widgets">
            <Button icon={<ReloadOutlined />} onClick={refresh} />
          </Tooltip>

          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={() => setExportOpen(true)}
          >
            Export
          </Button>
        </Space>
      </div>

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </>
  );
}

// ─── Dashboard Grid ─────────────────────────────────────────────────

function AnalyticsDashboard(): React.ReactNode {
  return (
    <div>
      <AnalyticsToolbar />

      {/* Row 1: Executive Summary (full width) */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <ExecutiveSummaryWidget />
        </Col>
      </Row>

      {/* Row 2: Revenue Forecast + Collection Rate */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={16}>
          <RevenueForecastWidget />
        </Col>
        <Col xs={24} lg={8}>
          <CollectionRateWidget />
        </Col>
      </Row>

      {/* Row 3: Pipeline Health + Service Mix */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <PipelineHealthWidget />
        </Col>
        <Col xs={24} lg={12}>
          <ServiceMixWidget />
        </Col>
      </Row>

      {/* Row 4: Seasonal Trends (full width for dual-axis) */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <SeasonalTrendsWidget />
        </Col>
      </Row>

      {/* Row 5: Staff Benchmark + Channel ROI */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <StaffBenchmarkWidget />
        </Col>
        <Col xs={24} lg={12}>
          <ChannelRoiWidget />
        </Col>
      </Row>

      {/* Row 6: CLV + Churn Risk */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <ClvWidget />
        </Col>
        <Col xs={24} lg={12}>
          <ChurnRiskWidget />
        </Col>
      </Row>
    </div>
  );
}

// ─── Page Export (wraps with provider) ──────────────────────────────

export function AnalyticsPage(): React.ReactNode {
  return (
    <AnalyticsProvider>
      <AnalyticsDashboard />
    </AnalyticsProvider>
  );
}
