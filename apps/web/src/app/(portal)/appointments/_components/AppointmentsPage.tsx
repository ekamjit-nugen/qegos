'use client';

import {
  Button,
  Card,
  Col,
  Empty,
  Row,
  Spin,
  Tag,
  Typography,
} from 'antd';
import {
  CalendarOutlined,
  EnvironmentOutlined,
  PhoneOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import { useUpcomingAppointments } from '@/hooks/usePortal';
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_COLORS,
} from '@/types/appointment';
import type { Appointment } from '@/types/appointment';
import { formatDate } from '@/lib/utils/format';

const { Title, Text } = Typography;

const TYPE_LABELS: Record<string, string> = {
  in_person: 'In Person',
  phone: 'Phone',
  video: 'Video',
};

const TYPE_COLORS: Record<string, string> = {
  in_person: 'blue',
  phone: 'cyan',
  video: 'purple',
};

const TYPE_ICONS: Record<string, ReactNode> = {
  in_person: <EnvironmentOutlined />,
  phone: <PhoneOutlined />,
  video: <VideoCameraOutlined />,
};

export function AppointmentsPage(): React.ReactNode {
  const { data: appointments, isLoading } = useUpcomingAppointments();

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        Upcoming Appointments
      </Title>

      {(!appointments || appointments.length === 0) ? (
        <Empty
          image={<CalendarOutlined style={{ fontSize: 48, color: '#ccc' }} />}
          description="No upcoming appointments"
        />
      ) : (
        <Row gutter={[16, 16]}>
          {appointments.map((apt: Appointment) => (
            <Col xs={24} sm={12} lg={8} key={apt._id}>
              <Card>
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  <Text
                    strong
                    style={{ fontSize: 24, display: 'block', lineHeight: 1.2 }}
                  >
                    {formatDate(apt.date, 'DD MMM')}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 14 }}>
                    {formatDate(apt.date, 'dddd, YYYY')}
                  </Text>
                </div>

                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  <Text style={{ fontSize: 16 }}>
                    {apt.startTime} - {apt.endTime}
                  </Text>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <Tag
                    icon={TYPE_ICONS[apt.type]}
                    color={TYPE_COLORS[apt.type] ?? 'default'}
                  >
                    {TYPE_LABELS[apt.type] ?? apt.type}
                  </Tag>
                  <Tag color={APPOINTMENT_STATUS_COLORS[apt.status] ?? 'default'}>
                    {APPOINTMENT_STATUS_LABELS[apt.status] ?? apt.status}
                  </Tag>
                </div>

                {apt.type === 'video' && apt.meetingLink && (
                  <div style={{ textAlign: 'center' }}>
                    <Button
                      type="primary"
                      icon={<VideoCameraOutlined />}
                      href={apt.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Join Meeting
                    </Button>
                  </div>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
