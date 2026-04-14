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
  Space,
  Spin,
  Tag,
  Typography,
  message,
  Popconfirm,
} from 'antd';
import {
  CalendarOutlined,
  CloseCircleOutlined,
  EnvironmentOutlined,
  PhoneOutlined,
  PlusOutlined,
  SwapOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import dayjs from 'dayjs';
import {
  useUpcomingAppointments,
  useMyOrders,
  useAvailableSlots,
  useBookAppointment,
  useRescheduleAppointment,
  useCancelAppointment,
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

/** Statuses that allow reschedule/cancel */
const ACTIVE_STATUSES = ['scheduled', 'confirmed', 'rescheduled'];

export function AppointmentsPage(): React.ReactNode {
  const { data: appointments, isLoading } = useUpcomingAppointments();
  const { data: orders } = useMyOrders();
  const bookMutation = useBookAppointment();
  const rescheduleMutation = useRescheduleAppointment();
  const cancelMutation = useCancelAppointment();

  // Booking modal state
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | undefined>();
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{
    startTime: string;
    staffId: string;
  } | null>(null);
  const [selectedType, setSelectedType] = useState<'in_person' | 'phone' | 'video'>('phone');

  // Reschedule modal state
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleAppointment, setRescheduleAppointment] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<dayjs.Dayjs | null>(null);
  const [rescheduleSlot, setRescheduleSlot] = useState<{
    startTime: string;
    staffId: string;
  } | null>(null);
  const [rescheduleType, setRescheduleType] = useState<'in_person' | 'phone' | 'video'>('phone');

  // Date range for slot query — selected date ± 0 days (just that day)
  const dateFrom = selectedDate?.format('YYYY-MM-DD');
  const dateTo = selectedDate?.format('YYYY-MM-DD');

  const rescheduleDateFrom = rescheduleDate?.format('YYYY-MM-DD');
  const rescheduleDateTo = rescheduleDate?.format('YYYY-MM-DD');

  const { data: availableSlots, isLoading: slotsLoading } = useAvailableSlots(
    dateFrom,
    dateTo,
  );

  const { data: rescheduleSlots, isLoading: rescheduleSlotsLoading } = useAvailableSlots(
    rescheduleDateFrom,
    rescheduleDateTo,
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
          const errMsg = (err as Error & { response?: { data?: { message?: string } } })
            .response?.data?.message ?? 'Failed to book appointment';
          void message.error(errMsg);
        },
      },
    );
  }, [selectedOrderId, selectedDate, selectedSlot, selectedType, bookMutation]);

  // ── Reschedule handlers ──────────────────────────────────────────────

  const handleOpenReschedule = useCallback((apt: Appointment) => {
    setRescheduleAppointment(apt);
    setRescheduleDate(null);
    setRescheduleSlot(null);
    setRescheduleType(apt.type);
    setRescheduleOpen(true);
  }, []);

  const handleReschedule = useCallback(() => {
    if (!rescheduleAppointment || !rescheduleDate || !rescheduleSlot) {
      void message.warning('Please select a new date and time slot');
      return;
    }

    rescheduleMutation.mutate(
      {
        appointmentId: rescheduleAppointment._id,
        date: rescheduleDate.format('YYYY-MM-DD'),
        startTime: rescheduleSlot.startTime,
        type: rescheduleType,
      },
      {
        onSuccess: () => {
          void message.success('Appointment rescheduled successfully!');
          setRescheduleOpen(false);
          setRescheduleAppointment(null);
        },
        onError: (err) => {
          const errMsg = (err as Error & { response?: { data?: { message?: string } } })
            .response?.data?.message ?? 'Failed to reschedule appointment';
          void message.error(errMsg);
        },
      },
    );
  }, [rescheduleAppointment, rescheduleDate, rescheduleSlot, rescheduleType, rescheduleMutation]);

  // ── Cancel handler ───────────────────────────────────────────────────

  const handleCancel = useCallback((aptId: string) => {
    cancelMutation.mutate(aptId, {
      onSuccess: () => {
        void message.success('Appointment cancelled');
      },
      onError: (err) => {
        const errMsg = (err as Error & { response?: { data?: { message?: string } } })
          .response?.data?.message ?? 'Failed to cancel appointment';
        void message.error(errMsg);
      },
    });
  }, [cancelMutation]);

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
                  <div style={{ textAlign: 'center', marginBottom: 12 }}>
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

                {/* Reschedule & Cancel buttons for active appointments */}
                {ACTIVE_STATUSES.includes(apt.status) && (
                  <div style={{ textAlign: 'center', marginTop: 8 }}>
                    <Space>
                      <Button
                        icon={<SwapOutlined />}
                        onClick={() => { handleOpenReschedule(apt); }}
                      >
                        Reschedule
                      </Button>
                      <Popconfirm
                        title="Cancel this appointment?"
                        description="This action cannot be undone."
                        onConfirm={() => { handleCancel(apt._id); }}
                        okText="Yes, Cancel"
                        cancelText="No"
                        okButtonProps={{ danger: true }}
                      >
                        <Button
                          danger
                          icon={<CloseCircleOutlined />}
                          loading={cancelMutation.isPending}
                        >
                          Cancel
                        </Button>
                      </Popconfirm>
                    </Space>
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

      {/* Reschedule Modal */}
      <Modal
        title="Reschedule Appointment"
        open={rescheduleOpen}
        onCancel={() => { setRescheduleOpen(false); setRescheduleAppointment(null); }}
        onOk={handleReschedule}
        okText="Reschedule"
        okButtonProps={{
          loading: rescheduleMutation.isPending,
          disabled: !rescheduleDate || !rescheduleSlot,
        }}
        destroyOnClose
        width={520}
      >
        {rescheduleAppointment && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Current appointment info */}
            <Card size="small" style={{ background: '#f5f5f5' }}>
              <Text strong>Current Appointment</Text>
              <div style={{ marginTop: 4 }}>
                <Text>
                  {formatDate(rescheduleAppointment.date, 'DD MMM YYYY')} at{' '}
                  {rescheduleAppointment.startTime} - {rescheduleAppointment.endTime}
                </Text>
                <br />
                <Tag
                  icon={TYPE_ICONS[rescheduleAppointment.type]}
                  color={TYPE_COLORS[rescheduleAppointment.type] ?? 'default'}
                  style={{ marginTop: 4 }}
                >
                  {TYPE_LABELS[rescheduleAppointment.type] ?? rescheduleAppointment.type}
                </Tag>
              </div>
            </Card>

            {/* New Date */}
            <div>
              <Text strong style={{ display: 'block', marginBottom: 4 }}>
                New Date *
              </Text>
              <DatePicker
                value={rescheduleDate}
                onChange={(date) => {
                  setRescheduleDate(date);
                  setRescheduleSlot(null);
                }}
                disabledDate={(current) =>
                  current && current < dayjs().startOf('day')
                }
                style={{ width: '100%' }}
              />
            </div>

            {/* New Type */}
            <div>
              <Text strong style={{ display: 'block', marginBottom: 4 }}>
                Appointment Type
              </Text>
              <Radio.Group
                value={rescheduleType}
                onChange={(e) => { setRescheduleType(e.target.value as 'in_person' | 'phone' | 'video'); }}
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

            {/* Available Slots for new date */}
            {rescheduleDate && (
              <div>
                <Text strong style={{ display: 'block', marginBottom: 4 }}>
                  Available Time Slots
                </Text>
                {rescheduleSlotsLoading ? (
                  <Spin size="small" />
                ) : !rescheduleSlots || rescheduleSlots.length === 0 ? (
                  <Text type="secondary">No slots available on this date</Text>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {rescheduleSlots.map((slot, idx) => {
                      const isSelected =
                        rescheduleSlot?.startTime === slot.startTime &&
                        rescheduleSlot?.staffId === slot.staffId;
                      return (
                        <Button
                          key={`reschedule-${slot.staffId}-${slot.startTime}-${idx}`}
                          type={isSelected ? 'primary' : 'default'}
                          size="small"
                          onClick={() => {
                            setRescheduleSlot({
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
        )}
      </Modal>
    </div>
  );
}
