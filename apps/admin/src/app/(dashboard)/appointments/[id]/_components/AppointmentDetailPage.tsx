'use client';

import React from 'react';
import { Row, Col, Card, Descriptions, Tag, Button, Spin, Empty, Space, App } from 'antd';
import type { DescriptionsProps } from 'antd';
import { useAppointment, useTransitionAppointmentStatus } from '@/hooks/useAppointments';
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_COLORS,
  APPOINTMENT_TYPE_LABELS,
} from '@/types/appointment';
import type { AppointmentStatus } from '@/types/appointment';
import { formatDate, formatDateTime } from '@/lib/utils/format';

const STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ['confirmed', 'cancelled', 'rescheduled'],
  confirmed: ['completed', 'no_show', 'cancelled', 'rescheduled'],
  rescheduled: ['confirmed', 'cancelled'],
  completed: [],
  no_show: [],
  cancelled: [],
};

function getButtonType(status: AppointmentStatus): 'primary' | 'default' | 'dashed' {
  if (status === 'confirmed' || status === 'completed') { return 'primary'; }
  return 'default';
}

function isDangerStatus(status: AppointmentStatus): boolean {
  return status === 'cancelled' || status === 'no_show';
}

export function AppointmentDetailPage({ id }: { id: string }): React.ReactNode {
  const { data: appointment, isLoading } = useAppointment(id);
  const transitionStatus = useTransitionAppointmentStatus();
  const { message } = App.useApp();

  if (isLoading) { return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />; }
  if (!appointment) { return <Empty description="Appointment not found" />; }

  const validTransitions = STATUS_TRANSITIONS[appointment.status] ?? [];

  const handleTransition = async (status: AppointmentStatus): Promise<void> => {
    try {
      await transitionStatus.mutateAsync({ id: appointment._id, status });
      message.success(`Status updated to ${APPOINTMENT_STATUS_LABELS[status]}`);
    } catch {
      message.error('Failed to update status');
    }
  };

  const detailItems: DescriptionsProps['items'] = [
    { key: 'date', label: 'Date', children: formatDate(appointment.date) },
    { key: 'startTime', label: 'Start Time', children: appointment.startTime },
    { key: 'endTime', label: 'End Time', children: appointment.endTime },
    {
      key: 'type',
      label: 'Type',
      children: <Tag>{APPOINTMENT_TYPE_LABELS[appointment.type] ?? appointment.type}</Tag>,
    },
    {
      key: 'meetingLink',
      label: 'Meeting Link',
      children: appointment.meetingLink ? (
        <a href={appointment.meetingLink} target="_blank" rel="noopener noreferrer">
          {appointment.meetingLink}
        </a>
      ) : (
        '-'
      ),
    },
    { key: 'notes', label: 'Notes', children: appointment.notes ?? '-', span: 2 },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Appointment - {formatDate(appointment.date)}</h2>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Appointment Details" style={{ marginBottom: 16 }}>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small" items={detailItems} />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Status" style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <Tag color={APPOINTMENT_STATUS_COLORS[appointment.status]}>
                {APPOINTMENT_STATUS_LABELS[appointment.status]}
              </Tag>
            </div>
            {validTransitions.length > 0 && (
              <Space wrap>
                {validTransitions.map((status) => (
                  <Button
                    key={status}
                    type={getButtonType(status)}
                    danger={isDangerStatus(status)}
                    loading={transitionStatus.isPending}
                    onClick={() => void handleTransition(status)}
                  >
                    {APPOINTMENT_STATUS_LABELS[status]}
                  </Button>
                ))}
              </Space>
            )}
          </Card>

          <Card title="Participants" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Client">{appointment.userId}</Descriptions.Item>
              <Descriptions.Item label="Staff">{appointment.staffId}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Timeline" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Created">{formatDateTime(appointment.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Updated">{formatDateTime(appointment.updatedAt)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
