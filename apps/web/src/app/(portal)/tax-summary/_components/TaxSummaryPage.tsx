'use client';

import { useState } from 'react';
import {
  Card,
  Col,
  Descriptions,
  Empty,
  Row,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { useTaxSummaries, useYearComparison } from '@/hooks/usePortal';
import type { TaxYearSummary } from '@/types/taxSummary';
import { formatCurrency } from '@/lib/utils/format';

const { Title, Text } = Typography;

const ATO_STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  approved: 'green',
  rejected: 'red',
  paid: 'blue',
};

function DeltaText({ value, invertColor }: { value: number; invertColor?: boolean }): React.ReactNode {
  if (value === 0) { return <Text type="secondary">-</Text>; }
  const isPositive = value > 0;
  const color = invertColor
    ? (isPositive ? 'red' : 'green')
    : (isPositive ? 'green' : 'red');
  const prefix = isPositive ? '+' : '';
  return (
    <Text style={{ color }}>
      {prefix}{formatCurrency(value)}
    </Text>
  );
}

function PercentChange({ value }: { value: number }): React.ReactNode {
  if (!isFinite(value) || value === 0) { return null; }
  const prefix = value > 0 ? '+' : '';
  return (
    <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
      ({prefix}{value.toFixed(1)}%)
    </Text>
  );
}

export function TaxSummaryPage(): React.ReactNode {
  const [selectedYear, setSelectedYear] = useState<string | undefined>(undefined);
  const { data: summaries, isLoading } = useTaxSummaries();
  const { data: comparison, isLoading: comparisonLoading } = useYearComparison(selectedYear);

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!summaries || summaries.length === 0) {
    return (
      <div>
        <Title level={3} style={{ marginBottom: 24 }}>Tax Summaries</Title>
        <Empty description="No tax summaries available yet" />
      </div>
    );
  }

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        Tax Summaries
      </Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {summaries.map((summary: TaxYearSummary) => (
          <Col xs={24} sm={12} lg={8} key={summary._id}>
            <Card
              hoverable
              onClick={() => {
                setSelectedYear(
                  selectedYear === summary.financialYear
                    ? undefined
                    : summary.financialYear,
                );
              }}
              style={{
                borderColor:
                  selectedYear === summary.financialYear ? '#1677ff' : undefined,
              }}
            >
              <Title level={4} style={{ marginBottom: 12 }}>
                {summary.financialYear}
              </Title>

              <Descriptions column={1} size="small">
                <Descriptions.Item label="Total Income">
                  {formatCurrency(summary.totalIncome)}
                </Descriptions.Item>
                <Descriptions.Item label="Total Deductions">
                  {formatCurrency(summary.totalDeductions)}
                </Descriptions.Item>
                <Descriptions.Item label="Refund / Owing">
                  <Text
                    strong
                    style={{
                      color: summary.refundOrOwing >= 0 ? 'green' : 'red',
                    }}
                  >
                    {formatCurrency(Math.abs(summary.refundOrOwing))}
                    {summary.refundOrOwing >= 0 ? ' refund' : ' owing'}
                  </Text>
                </Descriptions.Item>
              </Descriptions>

              <div style={{ marginTop: 8 }}>
                <Tag color={ATO_STATUS_COLORS[summary.atoRefundStatus] ?? 'default'}>
                  ATO: {summary.atoRefundStatus}
                </Tag>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {selectedYear && (
        <Card title={`${selectedYear} - Year Comparison`}>
          {comparisonLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin />
            </div>
          ) : !comparison ? (
            <Empty description="Comparison not available" />
          ) : (
            <Descriptions bordered column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="Total Income (Current)">
                {formatCurrency(comparison.current.totalIncome)}
              </Descriptions.Item>
              <Descriptions.Item label="Total Income (Previous)">
                {comparison.previous
                  ? formatCurrency(comparison.previous.totalIncome)
                  : '-'}
                {comparison.changes.totalIncome && (
                  <>
                    {' '}
                    <DeltaText value={comparison.changes.totalIncome.delta} />
                    <PercentChange value={comparison.changes.totalIncome.percentChange} />
                  </>
                )}
              </Descriptions.Item>

              <Descriptions.Item label="Total Deductions (Current)">
                {formatCurrency(comparison.current.totalDeductions)}
              </Descriptions.Item>
              <Descriptions.Item label="Total Deductions (Previous)">
                {comparison.previous
                  ? formatCurrency(comparison.previous.totalDeductions)
                  : '-'}
                {comparison.changes.totalDeductions && (
                  <>
                    {' '}
                    <DeltaText value={comparison.changes.totalDeductions.delta} />
                    <PercentChange value={comparison.changes.totalDeductions.percentChange} />
                  </>
                )}
              </Descriptions.Item>

              <Descriptions.Item label="Tax Payable (Current)">
                {formatCurrency(comparison.current.totalTaxPayable)}
              </Descriptions.Item>
              <Descriptions.Item label="Tax Payable (Previous)">
                {comparison.previous
                  ? formatCurrency(comparison.previous.totalTaxPayable)
                  : '-'}
                {comparison.changes.totalTaxPayable && (
                  <>
                    {' '}
                    <DeltaText
                      value={comparison.changes.totalTaxPayable.delta}
                      invertColor
                    />
                    <PercentChange value={comparison.changes.totalTaxPayable.percentChange} />
                  </>
                )}
              </Descriptions.Item>

              <Descriptions.Item label="Refund/Owing (Current)">
                <Text
                  strong
                  style={{
                    color: comparison.current.refundOrOwing >= 0 ? 'green' : 'red',
                  }}
                >
                  {formatCurrency(Math.abs(comparison.current.refundOrOwing))}
                  {comparison.current.refundOrOwing >= 0 ? ' refund' : ' owing'}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Refund/Owing (Previous)">
                {comparison.previous ? (
                  <>
                    <Text
                      style={{
                        color: comparison.previous.refundOrOwing >= 0 ? 'green' : 'red',
                      }}
                    >
                      {formatCurrency(Math.abs(comparison.previous.refundOrOwing))}
                      {comparison.previous.refundOrOwing >= 0 ? ' refund' : ' owing'}
                    </Text>
                    {comparison.changes.refundOrOwing && (
                      <>
                        {' '}
                        <DeltaText value={comparison.changes.refundOrOwing.delta} />
                        <PercentChange value={comparison.changes.refundOrOwing.percentChange} />
                      </>
                    )}
                  </>
                ) : (
                  '-'
                )}
              </Descriptions.Item>
            </Descriptions>
          )}
        </Card>
      )}
    </div>
  );
}
