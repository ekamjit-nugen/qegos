'use client';

import { Row, Col } from 'antd';
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

export function AnalyticsPage(): React.ReactNode {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Analytics Dashboard</h2>
      </div>

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

      {/* Row 4: Seasonal Trends + Staff Benchmark */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <SeasonalTrendsWidget />
        </Col>
        <Col xs={24} lg={12}>
          <StaffBenchmarkWidget />
        </Col>
      </Row>

      {/* Row 5: Channel ROI + CLV + Churn Risk */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <ChannelRoiWidget />
        </Col>
        <Col xs={24} lg={8}>
          <ClvWidget />
        </Col>
        <Col xs={24} lg={8}>
          <ChurnRiskWidget />
        </Col>
      </Row>
    </div>
  );
}
