'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Modal,
  Radio,
  Row,
  Select,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CalendarOutlined,
  EnvironmentOutlined,
  PhoneOutlined,
  PlusOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import dayjs from 'dayjs';
import {
  useUpcomingAppointments,
  useMyOrders,
  useAvailableSlots,
  useBookAppointment,
} from '@/hooks/usePortal';
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
  const { data: orders } = useMyOrders();
  const bookMutation = useBookAppointment();

  // Booking modal state
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | undefined>();
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{
    startTime: string;
    staffId: string;
  } | null>(null);
  const [selectedType, setSelectedType] = useState<'in_person' | 'phone' | 'video'>('phone');

  // Date range for slot query — selected date ± 0 days (just that day)
  const dateFrom = selectedDate?.format('YYYY-MM-DD');
  const dateTo = selectedDate?.format('YYYY-MM-DD');

  const { data: availableSlots, isLoading: slotsLoading } = useAvailableSlots(
    dateFrom,
    dateTo,
  );

  // Filter orders that are pending (no appointment yet)
  const bookableOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter(
      (o) => !o.scheduledAppointment && o.status <= 5, // Pending through Review
    );
  }, [orders]);

  const handleOpenBooking = useCallback(() => {
    setBookingOpen(true);
    setSelectedOrderId(undefined);
    setSelectedDate(null);
    setSelectedSlot(null);
    setSelectedType('phone');
  }, []);

  const handleBook = useCallback(() => {
    if (!selectedOrderId || !selectedDate || !selectedSlot) {
      void message.warning('Please select an order, date, and time slot');
      return;
    }

    bookMutation.mutate(
      {
        orderId: selectedOrderId,
        staffId: selectedSlot.staffId,
        date: selectedDate.format('YYYY-MM-DD'),
        startTime: selectedSlot.startTime,
        type: selectedType,
      },
      {
        onSuccess: () => {
          void message.success('Appointment booked successfully!');
          setBookingOpen(false);
        },
        onError: (err) => {
          void message.error(
            (err as Error & { response?: { data?: { message?: string } } }).response?.data
              ?.message ?? 'Failed to book appointment',
          );
        },
      },
    );
  }, [selectedOrderId, selectedDate, selectedSlot, selectedType, bookMutation]);

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <Title level={3} style={{ margin: 0 }}>
          Appointments
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleOpenBooking}
          disabled={bookableOrders.length === 0}
        >
          Book Appointment
        </Button>
      </div>

      {/* Upcoming Appointments */}
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

      {/* Booking Modal */}
      <Modal
        title="Book an Appointment"
        open={bookingOpen}
        onCancel={() => { setBookingOpen(false); }}
        onOk={handleBook}
        okText="Book Appointment"
        okButtonProps={{
          loading: bookMutation.isPending,
          disabled: !selectedOrderId || !selectedDate || !selectedSlot,
        }}
        destroyOnClose
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Select Order */}
          <div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>
              Select Order *
            </Text>
            <Select
              value={selectedOrderId}
              onChange={setSelectedOrderId}
              placeholder="Choose an order"
              style={{ width: '100%' }}
              options={bookableOrders.map((o) => ({
                label: `${o.orderNumber} — FY ${o.financialYear}`,
                value: o._id,
              }))}
            />
          </div>

          {/* Select Date */}
          <div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>
              Select Date *
            </Text>
            <DatePicker
              value={selectedDate}
              onChange={(date) => {
                setSelectedDate(date);
                setSelectedSlot(null);
              }}
              disabledDate={(current) =>
                current && current < dayjs().startOf('day')
              }
              style={{ width: '100%' }}
            />
          </div>

          {/* Select Type */}
          <div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>
              Appointment Type *
            </Text>
            <Radio.Group
              value={selectedType}
              onChange={(e) => { setSelectedType(e.target.value as 'in_person' | 'phone' | 'video'); }}
            >
              <Radio.Button value="phone">
                <PhoneOutlined /> Phone
              </Radio.Button>
              <Radio.Button value="video">
                <VideoCameraOutlined /> Video
              </Radio.Button>
              <Radio.Button value="in_person">
                <EnvironmentOutlined /> In Person
              </Radio.Button>
            </Radio.Group>
          </div>

          {/* Available Slots */}
          {selectedDate && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 4 }}>
                Available Time Slots
              </Text>
              {slotsLoading ? (
                <Spin size="small" />
              ) : !availableSlots || availableSlots.length === 0 ? (
                <Text type="secondary">No slots available on this date</Text>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {availableSlots.map((slot, idx) => {
                    const isSelected =
                      selectedSlot?.startTime === slot.startTime &&
                      selectedSlot?.staffId === slot.staffId;
                    return (
                      <Button
                        key={`${slot.staffId}-${slot.startTime}-${idx}`}
                        type={isSelected ? 'primary' : 'default'}
                        size="small"
                        onClick={() => {
                          setSelectedSlot({
                            startTime: slot.startTime,
                            staffId: slot.staffId,
                          });
                        }}
                      >
                        {slot.startTime} - {slot.endTime}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
